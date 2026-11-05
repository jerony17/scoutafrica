// Unit tests for the PayPal refund/reversal policy (app/lib/paypalRefunds.ts)
// and the billing rules it relies on. No network, no database: every
// PayPal and Supabase call is a fake. Run with `npm test` (Node 24 strips
// the TypeScript types natively).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  processRefundEvent,
  revocationUpdate,
  nextPaymentStatus,
  saleIdCandidates,
  statusesBelow,
  guardRevokedRenewal,
  renewalReviewReason,
} from "../app/lib/paypalRefunds.ts";
import { RequestTimeoutError } from "../app/lib/httpTimeout.ts";
import { findConfirmedPayment, paidUntil } from "../app/lib/paypalBilling.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const SALE = "8XK11111AA2222222";
const SUB = "I-TESTSUB00001";

function apiError(status) {
  return Object.assign(new Error(`PayPal request failed`), { status });
}

const timeout = () => new RequestTimeoutError("PayPal request timed out after 8000 ms");

// Every fake call yields to the event loop, so two deliveries run with
// Promise.all genuinely interleave (both read before either writes).
const tick = () => new Promise((resolve) => setImmediate(resolve));

// Fake world: one recorded $16 monthly payment on a linked, Premium row.
function world(overrides = {}) {
  const state = {
    payment: { saleId: SALE, subscriptionRowId: 7, paymentStatus: "success", paymentDate: "2026-11-01T10:00:00.000Z" },
    row: {
      id: 7,
      status: "premium",
      payment_provider: "paypal",
      paypal_subscription_id: SUB,
      expires_at: "2026-12-04T10:00:00.000Z",
      cancelled_at: null,
    },
    transactionStatus: "REFUNDED",
    paypalStatus: "ACTIVE",
    cancelBehaviour: "ok", // ok | 422 | fail | noop | timeout-applied | timeout-lost
    listFails: false,
    statusGetFails: false,
    failWrite: null, // "setPaymentStatus" | "revokeAccess" -> one timed-out write
    ...overrides,
  };
  const calls = { cancel: 0, setPaymentStatus: [], onlyFrom: [], revoke: [], records: [], list: 0 };
  const rows = new Map(); // paypal_refund_events, keyed like its unique paypal_event_id

  const deps = {
    async findRecordedPayment(ids) {
      await tick();
      return state.payment && ids.includes(state.payment.saleId) ? { ...state.payment } : null;
    },
    async loadSubscriptionRow(id) {
      await tick();
      return state.row && state.row.id === id ? { ...state.row } : null;
    },
    async listTransactions(subscriptionId) {
      calls.list++;
      await tick();
      if (state.listFails === "timeout") throw timeout();
      if (state.listFails) throw apiError(503);
      if (subscriptionId !== SUB) return [];
      return [{ id: SALE, status: state.transactionStatus, time: "2026-11-01T10:00:00Z", amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "16.00" } } }];
    },
    async getSubscriptionStatus() {
      await tick();
      if (state.statusGetFails === "timeout") throw timeout();
      if (state.statusGetFails) throw apiError(500);
      return state.paypalStatus;
    },
    async cancelSubscription() {
      calls.cancel++;
      await tick();
      if (state.cancelBehaviour === "fail") throw apiError(500);
      if (state.cancelBehaviour === "422") throw apiError(422);
      if (state.cancelBehaviour === "timeout-lost") throw timeout(); // never reached PayPal
      if (state.paypalStatus === "CANCELLED") throw apiError(422); // real PayPal: not cancellable twice
      if (state.cancelBehaviour === "ok") state.paypalStatus = "CANCELLED";
      if (state.cancelBehaviour === "timeout-applied") {
        state.paypalStatus = "CANCELLED"; // PayPal did it, but the response never arrived
        throw timeout();
      }
    },
    async setPaymentStatus(saleId, status, onlyFrom) {
      calls.setPaymentStatus.push(status);
      calls.onlyFrom.push(onlyFrom);
      await tick();
      if (state.failWrite === "setPaymentStatus") {
        state.failWrite = null;
        throw timeout();
      }
      // Same semantics as the real conditional UPDATE ... WHERE payment_status IN (onlyFrom).
      if (onlyFrom.includes(state.payment.paymentStatus)) state.payment.paymentStatus = status;
    },
    async revokeAccess(rowId, update) {
      calls.revoke.push(update);
      await tick();
      if (state.failWrite === "revokeAccess") {
        state.failWrite = null;
        throw timeout();
      }
      Object.assign(state.row, update);
    },
    async recordOutcome(record) {
      calls.records.push(record);
      await tick();
      rows.set(record.eventId, record); // upsert on paypal_event_id
    },
    now: () => NOW,
  };
  return { state, calls, deps, rows };
}

const refunded = (id = "WH-REFUND-1") => ({ id, event_type: "PAYMENT.SALE.REFUNDED", resource: { id: "REFUND-ID-1", sale_id: SALE } });
const reversed = (id = "WH-REVERSE-1") => ({ id, event_type: "PAYMENT.SALE.REVERSED", resource: { id: SALE } });

test("full refund: revokes Premium now and cancels the PayPal subscription (confirmed)", async () => {
  const { state, calls, deps } = world();
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.kind, "done");
  assert.equal(result.retry, false);
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.deepEqual(calls.setPaymentStatus, ["refunded"]);
  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.expires_at, NOW.toISOString());
  assert.equal(state.row.cancelled_at, NOW.toISOString());
  assert.equal(calls.cancel, 1);
  assert.equal(result.record.paypalSubscriptionId, SUB); // from our row, not the payload
});

test("partial refund: keeps Premium, does not cancel, records partially_refunded", async () => {
  const { state, calls, deps } = world({ transactionStatus: "PARTIALLY_REFUNDED" });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "partial_refund_access_retained");
  assert.equal(result.record.paypalCancellation, "not_required");
  assert.equal(result.retry, false);
  assert.deepEqual(calls.setPaymentStatus, ["partially_refunded"]);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.equal(state.row.status, "premium");
});

test("refund event while PayPal still reports COMPLETED: flagged for review, retried, access untouched", async () => {
  const { state, calls, deps } = world({ transactionStatus: "COMPLETED" });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, true);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.deepEqual(calls.setPaymentStatus, []);
  assert.equal(state.row.status, "premium");
});

test("reversal (chargeback): revokes Premium, cancels subscription, records reversed", async () => {
  const { state, calls, deps } = world({ transactionStatus: "COMPLETED" });
  const result = await processRefundEvent(deps, reversed());

  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.deepEqual(calls.setPaymentStatus, ["reversed"]);
  assert.equal(state.row.status, "cancelled");
  assert.equal(calls.cancel, 1);
});

test("duplicate full-refund event: no second revocation and no second cancel request", async () => {
  const { calls, deps } = world();
  await processRefundEvent(deps, refunded());
  const second = await processRefundEvent(deps, refunded());

  assert.equal(second.record.outcome, "access_revoked");
  assert.equal(second.record.paypalCancellation, "confirmed");
  assert.equal(calls.revoke.length, 1);
  assert.equal(calls.cancel, 1);
  assert.deepEqual(calls.setPaymentStatus, ["refunded"]); // not rewritten
  assert.equal(calls.records.length, 2); // same event id -> upserted in place
  assert.equal(calls.records[0].eventId, calls.records[1].eventId);
});

test("reversal after a refund: status upgrades to reversed, still only one cancel", async () => {
  const { calls, deps } = world();
  await processRefundEvent(deps, refunded());
  await processRefundEvent(deps, reversed());
  assert.deepEqual(calls.setPaymentStatus, ["refunded", "reversed"]);
  assert.equal(calls.cancel, 1);
});

test("sale not recorded by ScoutAfrica: review only, nothing revoked or cancelled", async () => {
  const { calls, deps } = world({ payment: null });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, false);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.equal(calls.list, 0);
});

test("subscription row no longer PayPal (switched provider): review only", async () => {
  const { calls, deps } = world({
    row: { id: 7, status: "premium", payment_provider: "stripe", paypal_subscription_id: null, expires_at: "2027-01-01T00:00:00Z", cancelled_at: null },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
});

test("subscription row missing: review only", async () => {
  const { calls, deps } = world({ row: null });
  const result = await processRefundEvent(deps, reversed());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
});

test("sale not on the linked PayPal subscription (an older one): review only", async () => {
  const { calls, deps } = world({
    row: { id: 7, status: "premium", payment_provider: "paypal", paypal_subscription_id: "I-OTHERSUB0002", expires_at: "2027-01-01T00:00:00Z", cancelled_at: null },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
});

test("PayPal API failure while verifying: review + retry, access untouched", async () => {
  const { state, calls, deps } = world({ listFails: true });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, true);
  assert.match(result.record.reviewReason, /HTTP 503/);
  assert.equal(calls.revoke.length, 0);
  assert.equal(state.row.status, "premium");
});

test("PayPal cancel fails: access still revoked, cancellation pending (not confirmed), retried", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "fail" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(result.retry, true);
  assert.equal(state.row.status, "cancelled");
  assert.equal(calls.cancel, 1);
});

test("PayPal accepts cancel but still reports ACTIVE: not marked confirmed", async () => {
  const { deps } = world({ cancelBehaviour: "noop" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(result.retry, true);
});

test("cancel returns 422 and PayPal reports CANCELLED on re-read: confirmed", async () => {
  const { state, deps } = world({ cancelBehaviour: "422" });
  deps.cancelSubscription = async () => {
    state.paypalStatus = "CANCELLED";
    throw apiError(422);
  };
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.equal(result.retry, false);
});

test("subscription status lookup fails: cancellation pending, never assumed", async () => {
  const { calls, deps } = world({ statusGetFails: true });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(calls.cancel, 0);
  assert.equal(result.retry, true);
});

test("retry after a failed cancel completes it without revoking twice", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "fail" });
  await processRefundEvent(deps, refunded());
  state.cancelBehaviour = "ok";
  const second = await processRefundEvent(deps, refunded());
  assert.equal(second.record.paypalCancellation, "confirmed");
  assert.equal(second.retry, false);
  assert.equal(calls.revoke.length, 1);
  assert.equal(calls.cancel, 2);
});

test("ordinary-cancelled (renewing) member with a full refund loses the remaining paid time", async () => {
  const { state, deps } = world({
    paypalStatus: "CANCELLED",
    row: { id: 7, status: "renewing", payment_provider: "paypal", paypal_subscription_id: SUB, expires_at: "2026-12-04T10:00:00.000Z", cancelled_at: "2026-11-05T00:00:00.000Z" },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.expires_at, NOW.toISOString());
  assert.equal(state.row.cancelled_at, "2026-11-05T00:00:00.000Z"); // original cancel time kept
});

test("events without an id, or of another type, are ignored", async () => {
  const { calls, deps } = world();
  assert.equal((await processRefundEvent(deps, { event_type: "PAYMENT.SALE.REFUNDED", resource: { sale_id: SALE } })).kind, "ignored");
  assert.equal((await processRefundEvent(deps, { id: "x", event_type: "PAYMENT.SALE.COMPLETED", resource: { id: SALE } })).kind, "ignored");
  assert.equal(calls.records.length, 0);
});

test("event with no sale id: review only", async () => {
  const { calls, deps } = world();
  const result = await processRefundEvent(deps, { id: "WH-X", event_type: "PAYMENT.SALE.REVERSED", resource: {} });
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
});

test("helpers: revocationUpdate, nextPaymentStatus, saleIdCandidates", () => {
  const expired = { id: 1, status: "expired", payment_provider: "paypal", paypal_subscription_id: SUB, expires_at: "2026-10-01T00:00:00.000Z", cancelled_at: null };
  assert.equal(revocationUpdate(expired, NOW), null);
  const active = { ...expired, status: "premium", expires_at: "2027-01-01T00:00:00.000Z" };
  assert.equal(revocationUpdate(active, NOW).expires_at, NOW.toISOString());

  assert.equal(nextPaymentStatus("success", "partially_refunded"), "partially_refunded");
  assert.equal(nextPaymentStatus("partially_refunded", "refunded"), "refunded");
  assert.equal(nextPaymentStatus("refunded", "partially_refunded"), null);
  assert.equal(nextPaymentStatus("reversed", "refunded"), null);

  assert.deepEqual(saleIdCandidates({ resource: { id: "R1", sale_id: "S1" } }), ["S1", "R1"]);
  assert.deepEqual(saleIdCandidates({ resource: { id: 5 } }), []);
});

test("unchanged: monthly $16 / annual $170 payment confirmation and paid periods", () => {
  const tx = (status, value) => [{ id: "T1", status, time: "2026-01-31T00:00:00Z", amount_with_breakdown: { gross_amount: { currency_code: "USD", value } } }];
  assert.equal(findConfirmedPayment(tx("COMPLETED", "16.00"), "T1", { currency: "USD", amount: 16 }).ok, true);
  assert.equal(findConfirmedPayment(tx("COMPLETED", "170.00"), "T1", { currency: "USD", amount: 170 }).ok, true);
  assert.equal(findConfirmedPayment(tx("REFUNDED", "16.00"), "T1", { currency: "USD", amount: 16 }).ok, false);
  assert.equal(findConfirmedPayment(tx("COMPLETED", "8.00"), "T1", { currency: "USD", amount: 16 }).ok, false);
  assert.equal(paidUntil("2026-01-31T00:00:00Z", "monthly").toISOString(), "2026-03-03T00:00:00.000Z");
  assert.equal(paidUntil("2026-11-03T14:31:35Z", "annual").toISOString(), "2027-11-06T14:31:35.000Z");
});

// === Refund status never moves backwards (conditional update) ===

test("statusesBelow: the conditional update only replaces lower-ranked statuses", () => {
  assert.deepEqual(statusesBelow("partially_refunded"), ["success"]);
  assert.deepEqual(statusesBelow("refunded"), ["success", "partially_refunded"]);
  assert.deepEqual(statusesBelow("reversed"), ["success", "partially_refunded", "refunded"]);
});

test("stale REFUNDED delivery after REVERSED: 'reversed' is never overwritten", async () => {
  const { state, calls, deps } = world({ transactionStatus: "REFUNDED" });
  await processRefundEvent(deps, reversed());
  assert.equal(state.payment.paymentStatus, "reversed");

  // A REFUNDED delivery that read the payment before the reversal was written.
  deps.findRecordedPayment = async () => ({ ...state.payment, paymentStatus: "success" });
  await processRefundEvent(deps, refunded());

  assert.deepEqual(calls.setPaymentStatus, ["reversed", "refunded"]); // it tried...
  assert.deepEqual(calls.onlyFrom[1], ["success", "partially_refunded"]); // ...conditionally
  assert.equal(state.payment.paymentStatus, "reversed"); // ...and matched nothing
});

test("REFUNDED and REVERSED delivered concurrently: ends 'reversed' in either order", async () => {
  for (const order of [[refunded, reversed], [reversed, refunded]]) {
    const { state, calls, deps } = world();
    await Promise.all(order.map((make) => processRefundEvent(deps, make())));
    assert.equal(state.payment.paymentStatus, "reversed");
    assert.equal(state.row.status, "cancelled");
    assert.equal(state.paypalStatus, "CANCELLED");
    assert.ok(calls.cancel <= 2);
  }
});

test("partial then full refund: partially_refunded -> refunded (upgrade still allowed)", async () => {
  const { state, deps } = world({ transactionStatus: "PARTIALLY_REFUNDED" });
  await processRefundEvent(deps, refunded("WH-PARTIAL"));
  assert.equal(state.payment.paymentStatus, "partially_refunded");
  state.transactionStatus = "REFUNDED";
  await processRefundEvent(deps, refunded("WH-FULL"));
  assert.equal(state.payment.paymentStatus, "refunded");
  assert.equal(state.row.status, "cancelled");
});

// === Concurrent duplicate deliveries ===

test("same full-refund event delivered twice concurrently: one outcome row, revoked, cancel confirmed", async () => {
  const { state, calls, deps, rows } = world();
  const [a, b] = await Promise.all([processRefundEvent(deps, refunded()), processRefundEvent(deps, refunded())]);

  for (const result of [a, b]) {
    assert.equal(result.record.outcome, "access_revoked");
    assert.equal(result.record.paypalCancellation, "confirmed"); // the loser's cancel got 422, re-read says CANCELLED
    assert.equal(result.retry, false);
  }
  assert.equal(rows.size, 1);
  assert.equal(state.payment.paymentStatus, "refunded");
  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.expires_at, NOW.toISOString());
  assert.equal(state.paypalStatus, "CANCELLED");
  assert.ok(calls.cancel >= 1 && calls.cancel <= 2);
});

test("same partial-refund event delivered twice concurrently: access kept, one outcome row", async () => {
  const { state, calls, deps, rows } = world({ transactionStatus: "PARTIALLY_REFUNDED" });
  await Promise.all([processRefundEvent(deps, refunded()), processRefundEvent(deps, refunded())]);
  assert.equal(rows.size, 1);
  assert.equal(state.payment.paymentStatus, "partially_refunded");
  assert.equal(state.row.status, "premium");
  assert.equal(calls.cancel, 0);
});

// === Timeouts ===

test("timeout listing transactions: review + retry, access untouched", async () => {
  const { state, calls, deps } = world({ listFails: "timeout" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, true);
  assert.match(result.record.reviewReason, /timed out/);
  assert.equal(calls.revoke.length, 0);
  assert.equal(state.row.status, "premium");
});

test("cancel times out but PayPal applied it: re-read confirms, no retry", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "timeout-applied" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.equal(result.retry, false);
  assert.equal(calls.cancel, 1);
  assert.equal(state.row.status, "cancelled");
});

test("cancel times out and was lost: pending + retry; the retry completes it without a second revocation", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "timeout-lost" });
  const first = await processRefundEvent(deps, refunded());
  assert.equal(first.record.outcome, "access_revoked");
  assert.equal(first.record.paypalCancellation, "pending");
  assert.equal(first.retry, true);
  assert.match(first.record.reviewReason, /cancel failed: .*timed out/);
  assert.equal(state.row.status, "cancelled"); // access already ended

  state.cancelBehaviour = "ok";
  const second = await processRefundEvent(deps, refunded());
  assert.equal(second.record.paypalCancellation, "confirmed");
  assert.equal(second.retry, false);
  assert.equal(calls.revoke.length, 1);
});

test("status read times out: pending + retry, no cancel sent blind", async () => {
  const { calls, deps } = world({ statusGetFails: "timeout" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(result.retry, true);
  assert.equal(calls.cancel, 0);
});

test("database write times out mid-way: review + retry; the retry finishes revocation and cancel", async () => {
  for (const failWrite of ["setPaymentStatus", "revokeAccess"]) {
    const { state, deps, rows } = world({ failWrite });
    const first = await processRefundEvent(deps, refunded());
    assert.equal(first.record.outcome, "needs_review");
    assert.equal(first.retry, true);
    assert.equal(state.paypalStatus, "ACTIVE"); // never cancels before access is revoked

    const second = await processRefundEvent(deps, refunded());
    assert.equal(second.record.outcome, "access_revoked");
    assert.equal(second.record.paypalCancellation, "confirmed");
    assert.equal(second.retry, false);
    assert.equal(state.payment.paymentStatus, "refunded");
    assert.equal(state.row.status, "cancelled");
    assert.equal(rows.get("WH-REFUND-1").outcome, "access_revoked"); // review row overwritten by the success
  }
});

// === Renewal after a confirmed revocation (guardRevokedRenewal) ===

const RENEWAL_SALE = "9RENEWAL000000001";

function renewalWorld(overrides = {}) {
  const state = {
    revoked: { id: 42, eventId: "WH-REFUND-1", reviewReason: null, cancellation: "pending" },
    paypalStatus: "ACTIVE",
    cancelBehaviour: "ok", // ok | fail | timeout-lost
    lookupFails: false,
    ...overrides,
  };
  const calls = { cancel: 0, flags: [] };
  const deps = {
    async findRevokedRefundEvent(subscriptionId) {
      await tick();
      if (state.lookupFails) throw timeout();
      return state.revoked && subscriptionId === SUB ? { ...state.revoked } : null;
    },
    async getSubscriptionStatus() {
      await tick();
      return state.paypalStatus;
    },
    async cancelSubscription() {
      calls.cancel++;
      await tick();
      if (state.cancelBehaviour === "fail") throw apiError(500);
      if (state.cancelBehaviour === "timeout-lost") throw timeout();
      if (state.paypalStatus === "CANCELLED") throw apiError(422);
      state.paypalStatus = "CANCELLED";
    },
    async flagForReview(id, reviewReason, cancellation) {
      calls.flags.push({ id, reviewReason, cancellation });
      await tick();
      Object.assign(state.revoked, { reviewReason, cancellation });
    },
  };
  return { state, calls, deps };
}

test("renewal after confirmed revocation: blocked, subscription cancelled, flagged for manual refund", async () => {
  const { state, calls, deps } = renewalWorld();
  const result = await guardRevokedRenewal(deps, SUB, RENEWAL_SALE);

  assert.equal(result.blocked, true);
  assert.equal(result.refundEventId, "WH-REFUND-1");
  assert.equal(result.cancellation, "confirmed");
  assert.equal(result.retry, false);
  assert.equal(calls.cancel, 1);
  assert.equal(state.paypalStatus, "CANCELLED");
  assert.equal(calls.flags.length, 1);
  assert.equal(calls.flags[0].id, 42);
  assert.equal(calls.flags[0].cancellation, "confirmed");
  assert.match(calls.flags[0].reviewReason, new RegExp(`Renewal payment ${RENEWAL_SALE} .*NOT re-granted.*refund this payment manually`));
});

test("subscription with no revoked refund: not blocked, no PayPal calls, nothing flagged", async () => {
  const { calls, deps } = renewalWorld({ revoked: null });
  const result = await guardRevokedRenewal(deps, SUB, RENEWAL_SALE);
  assert.deepEqual(result, { blocked: false });
  assert.equal(calls.cancel, 0);
  assert.equal(calls.flags.length, 0);
});

test("renewal blocked but cancel fails or times out: still blocked, cancellation pending, retry", async () => {
  for (const cancelBehaviour of ["fail", "timeout-lost"]) {
    const { calls, deps } = renewalWorld({ cancelBehaviour });
    const result = await guardRevokedRenewal(deps, SUB, RENEWAL_SALE);
    assert.equal(result.blocked, true); // never grants, whatever PayPal does
    assert.equal(result.cancellation, "pending");
    assert.equal(result.retry, true);
    assert.equal(calls.flags[0].cancellation, "pending");
  }
});

test("renewal redelivered: no second cancel, review note not duplicated", async () => {
  const { calls, deps } = renewalWorld();
  await guardRevokedRenewal(deps, SUB, RENEWAL_SALE);
  const second = await guardRevokedRenewal(deps, SUB, RENEWAL_SALE);
  assert.equal(second.blocked, true);
  assert.equal(second.retry, false);
  assert.equal(calls.cancel, 1);
  assert.equal(calls.flags[1].reviewReason, calls.flags[0].reviewReason);
});

test("renewal redelivered concurrently: both blocked, PayPal ends CANCELLED, note mentions the sale once", async () => {
  const { state, deps } = renewalWorld();
  const results = await Promise.all([guardRevokedRenewal(deps, SUB, RENEWAL_SALE), guardRevokedRenewal(deps, SUB, RENEWAL_SALE)]);
  assert.ok(results.every((r) => r.blocked && r.cancellation === "confirmed"));
  assert.equal(state.paypalStatus, "CANCELLED");
  assert.equal(state.revoked.reviewReason.split(RENEWAL_SALE).length - 1, 1);
});

test("lookup of revoked refunds fails (timeout): throws -> webhook 500, never treated as not blocked", async () => {
  const { deps } = renewalWorld({ lookupFails: true });
  await assert.rejects(() => guardRevokedRenewal(deps, SUB, RENEWAL_SALE), RequestTimeoutError);
});

test("renewalReviewReason: keeps earlier notes, adds new sales, reopens resolved rows", () => {
  const first = renewalReviewReason(null, "S1", null);
  assert.match(first, /^Renewal payment S1 /);
  assert.equal(renewalReviewReason(first, "S1", null), first);
  const both = renewalReviewReason(first, "S2", "PayPal still reports subscription I-X as ACTIVE after cancel");
  assert.match(both, /^Renewal payment S2 .*\(PayPal still reports.*\) \| Renewal payment S1 /);
  const reopened = renewalReviewReason("RESOLVED: refunded S1 on 2026-12-01", "S2", null);
  assert.match(reopened, /^Renewal payment S2 .* \| previously RESOLVED: refunded S1/);
  assert.ok(!reopened.startsWith("RESOLVED:"));
});
