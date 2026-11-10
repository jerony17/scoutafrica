// Stripe webhook status and payment rules (app/lib/stripeBilling.ts) and
// how app/api/stripe/webhook/route.ts uses them. A subscription only
// becomes Premium from a known, paid state; unknown statuses change
// nothing; a late update event can never restore a cancelled subscription;
// an unpaid checkout session activates nothing. No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isCheckoutSessionPaid,
  mapStripeSubscriptionStatus,
  shouldApplySubscriptionUpdate,
} from "../app/lib/stripeBilling.ts";

// === Status mapping ===

test("active and trialing subscriptions are Premium", () => {
  assert.equal(mapStripeSubscriptionStatus("active", false), "premium");
  assert.equal(mapStripeSubscriptionStatus("trialing", false), "premium");
});

test("active or trialing set to cancel at period end stay Premium as renewing", () => {
  assert.equal(mapStripeSubscriptionStatus("active", true), "renewing");
  assert.equal(mapStripeSubscriptionStatus("trialing", true), "renewing");
});

test("past_due stays past_due (not Premium), even when set to cancel at period end", () => {
  assert.equal(mapStripeSubscriptionStatus("past_due", false), "past_due");
  assert.equal(mapStripeSubscriptionStatus("past_due", true), "past_due");
});

test("canceled, unpaid and incomplete_expired are cancelled, whatever cancel_at_period_end says", () => {
  for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
    assert.equal(mapStripeSubscriptionStatus(status, false), "cancelled", status);
    assert.equal(mapStripeSubscriptionStatus(status, true), "cancelled", status);
  }
});

test("unknown or unsupported statuses change nothing (null)", () => {
  for (const status of ["incomplete", "paused", "some_future_status", "", null, undefined]) {
    assert.equal(mapStripeSubscriptionStatus(status, false), null, String(status));
    assert.equal(mapStripeSubscriptionStatus(status, true), null, String(status));
  }
});

// === Out-of-order protection ===

test("a cancelled subscription only accepts another cancelled update", () => {
  assert.equal(shouldApplySubscriptionUpdate("cancelled", "premium"), false);
  assert.equal(shouldApplySubscriptionUpdate("cancelled", "renewing"), false);
  assert.equal(shouldApplySubscriptionUpdate("cancelled", "past_due"), false);
  assert.equal(shouldApplySubscriptionUpdate("cancelled", "cancelled"), true);
});

test("live subscriptions accept every known update", () => {
  for (const current of ["premium", "renewing", "past_due", "pending", null, undefined]) {
    for (const next of ["premium", "renewing", "past_due", "cancelled"]) {
      assert.equal(shouldApplySubscriptionUpdate(current, next), true, `${current} -> ${next}`);
    }
  }
});

// Replays the webhook's decision for a sequence of customer.subscription.*
// events against one subscription row, the way the route applies them.
function replay(startStatus, events) {
  let status = startStatus;
  for (const event of events) {
    if (event.type === "deleted") {
      status = "cancelled";
      continue;
    }
    const next = mapStripeSubscriptionStatus(event.status, event.cancelAtPeriodEnd);
    if (next && shouldApplySubscriptionUpdate(status, next)) status = next;
  }
  return status;
}

test("a late 'active' update delivered after the deletion cannot restore Premium", () => {
  assert.equal(
    replay("premium", [{ type: "deleted" }, { type: "updated", status: "active", cancelAtPeriodEnd: false }]),
    "cancelled"
  );
  assert.equal(
    replay("renewing", [{ type: "deleted" }, { type: "updated", status: "active", cancelAtPeriodEnd: true }]),
    "cancelled"
  );
});

test("a late 'canceled' update after the deletion keeps it cancelled", () => {
  assert.equal(replay("premium", [{ type: "deleted" }, { type: "updated", status: "canceled" }]), "cancelled");
});

test("an unknown status in between leaves the record unchanged", () => {
  assert.equal(replay("premium", [{ type: "updated", status: "paused" }]), "premium");
  assert.equal(replay("past_due", [{ type: "updated", status: "incomplete" }]), "past_due");
});

test("normal lifecycle still works: renew, schedule cancel, fail, recover, unpaid", () => {
  assert.equal(replay("premium", [{ type: "updated", status: "active", cancelAtPeriodEnd: true }]), "renewing");
  assert.equal(replay("premium", [{ type: "updated", status: "past_due" }]), "past_due");
  assert.equal(replay("past_due", [{ type: "updated", status: "active" }]), "premium");
  assert.equal(replay("past_due", [{ type: "updated", status: "unpaid" }]), "cancelled");
});

// === Checkout payment ===

test("only a paid checkout session can activate Premium", () => {
  assert.equal(isCheckoutSessionPaid("paid"), true);
  for (const status of ["unpaid", "no_payment_required", "", null, undefined]) {
    assert.equal(isCheckoutSessionPaid(status), false, String(status));
  }
});

// === Route wiring ===

const route = readFileSync("app/api/stripe/webhook/route.ts", "utf8");
const fnBody = (name) => {
  const start = route.indexOf(`async function ${name}(`);
  const next = route.indexOf("\nasync function ", start + 1);
  return route.slice(start, next === -1 ? undefined : next);
};

test("checkout handler returns before any write when the session is not paid", () => {
  const body = fnBody("handleCheckoutCompleted");
  const check = body.indexOf("if (!isCheckoutSessionPaid(session.payment_status))");
  assert.ok(check > 0, "payment check missing");
  assert.ok(check < body.indexOf("stripe.subscriptions.retrieve"), "payment check must come before the Stripe lookup");
  assert.ok(check < body.indexOf(".upsert("), "payment check must come before the subscriptions upsert");
  assert.match(body.slice(check, body.indexOf(".upsert(")), /Premium NOT activated\.`\s*\);\s*return;/);
});

test("checkout handler still activates a paid session as premium with the Stripe ids", () => {
  const body = fnBody("handleCheckoutCompleted");
  assert.match(body, /status: "premium"/);
  assert.match(body, /payment_provider: "stripe"/);
  assert.match(body, /stripe_subscription_id: subscriptionId/);
  assert.match(body, /\{ onConflict: "user_id" \}/);
});

test("update handler maps status first, skips unknown statuses, and never writes past the guard", () => {
  const body = fnBody("handleSubscriptionUpdated");
  assert.match(body, /const status = mapStripeSubscriptionStatus\(subscription\.status, subscription\.cancel_at_period_end\);\s*if \(!status\) \{[\s\S]*?return;\s*\}/);
  const guard = body.indexOf("if (!shouldApplySubscriptionUpdate(row.status, status))");
  assert.ok(guard > 0, "out-of-order guard missing");
  assert.ok(guard < body.indexOf(".update("), "guard must come before the update");
  // The old fallback that turned any other status into premium is gone.
  assert.doesNotMatch(body, /: "premium";/);
});

// === Older subscription events vs a newer subscription ===
// Scenario: the customer's first Stripe subscription (sub_OLD) ended and
// they bought again; their one subscriptions row now holds sub_NEW, same
// Stripe customer. Each handler's row filter is read from the route and
// applied to that row with a sub_OLD event: it must not match.

const newerRow = { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_NEW" };
const olderEvent = { customerId: "cus_1", subscriptionId: "sub_OLD" };
const currentEvent = { customerId: "cus_1", subscriptionId: "sub_NEW" };

// The column and the event value every write in a handler filters on.
function writeFilters(name, subscriptionExpr) {
  const body = fnBody(name);
  const filters = [...body.matchAll(/\.update\([\s\S]*?\}\)\s*\.eq\("([a-z_]+)", ([a-zA-Z.]+)\)/g)].map((m) => ({
    column: m[1],
    usesEventSubscription: m[2] === subscriptionExpr,
  }));
  assert.ok(filters.length > 0, `${name}: no update found`);
  return filters;
}

function matches(filter, row, event) {
  if (filter.column === "stripe_subscription_id" && filter.usesEventSubscription) {
    return row.stripe_subscription_id === event.subscriptionId;
  }
  if (filter.column === "stripe_customer_id") return row.stripe_customer_id === event.customerId;
  throw new Error(`unexpected filter ${filter.column}`);
}

for (const [name, expr] of [
  ["handleSubscriptionDeleted", "subscription.id"],
  ["handleInvoicePaymentSucceeded", "subscriptionId"],
  ["handleInvoicePaymentFailed", "subscriptionId"],
]) {
  test(`${name}: an event from an older subscription cannot change the newer subscription`, () => {
    for (const filter of writeFilters(name, expr)) {
      assert.equal(matches(filter, newerRow, olderEvent), false, `${name} would update the newer row`);
      assert.equal(matches(filter, newerRow, currentEvent), true, `${name} no longer updates its own row`);
    }
  });
}

test("invoice handlers take the subscription id from the invoice and stop when there is none", () => {
  assert.match(route, /function invoiceSubscriptionId\(invoice: Stripe\.Invoice\): string \| null \{\s*return typeof invoice\.parent\?\.subscription_details\?\.subscription === "string"/);
  for (const name of ["handleInvoicePaymentSucceeded", "handleInvoicePaymentFailed"]) {
    assert.match(fnBody(name), /const subscriptionId = invoiceSubscriptionId\(invoice\);\s*if \(!subscriptionId\) \{?[\s\S]*?return;/, name);
  }
  // The PayPal-row check in payment_succeeded looks at the same subscription's row.
  assert.match(fnBody("handleInvoicePaymentSucceeded"), /\.select\("id, currency, payment_provider"\)\s*\.eq\("stripe_subscription_id", subscriptionId\)/);
});

test("no Stripe webhook write matches rows by customer id any more", () => {
  for (const name of ["handleSubscriptionUpdated", "handleSubscriptionDeleted", "handleInvoicePaymentSucceeded", "handleInvoicePaymentFailed"]) {
    assert.doesNotMatch(fnBody(name), /\.eq\("stripe_customer_id"/, name);
  }
});

test("update handler only touches the row of this subscription, never a PayPal row", () => {
  const body = fnBody("handleSubscriptionUpdated");
  assert.match(body, /\.eq\("stripe_subscription_id", subscription\.id\)\s*\.or\(NOT_A_PAYPAL_ROW\)/);
  assert.match(body, /\.update\(\{[\s\S]*?\}\)\s*\.eq\("id", row\.id\);/);
});
