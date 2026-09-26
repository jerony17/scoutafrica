import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "../../../lib/stripe";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// SECURITY: this route trusts NOTHING from the request body until the
// signature below is verified against the raw bytes. Everything after
// that point is guaranteed to have actually come from Stripe.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Every other event type is intentionally ignored, not an error.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    // 500 tells Stripe to retry - the event was genuinely authentic, this
    // is a transient failure on our side (e.g. a momentary DB issue).
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// Derives plan/billing_cycle from the Stripe Subscription's own Price
// object (price.recurring.interval) rather than from Checkout Session
// metadata - metadata is our own bookkeeping and could theoretically be
// missing or wrong; the Price's recurring interval is Stripe's own
// authoritative structure and is present on every subscription-related
// event, including renewals where no metadata is available at all. One
// implementation used by every write site below, instead of three
// separate, potentially-inconsistent derivations.
function derivePlanFields(subscription: Stripe.Subscription): {
  plan: "premium_monthly" | "premium_annual" | null;
  billing_cycle: "monthly" | "annual" | null;
} {
  const interval = subscription.items.data[0]?.price?.recurring?.interval;

  if (interval === "month") {
    return { plan: "premium_monthly", billing_cycle: "monthly" };
  }
  if (interval === "year") {
    return { plan: "premium_annual", billing_cycle: "annual" };
  }

  return { plan: null, billing_cycle: null };
}

// === checkout.session.completed ===
// Fires once, right after the customer completes payment. This is where
// we learn WHICH ScoutAfrica user just subscribed - via
// client_reference_id, set when the checkout session was created (see
// the accompanying change to create-checkout-session/route.ts). Without
// that, there is no way to link this Stripe event back to a Supabase
// user at all.
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;

  if (!userId) {
    console.error(
      "checkout.session.completed has no client_reference_id - cannot identify the user. " +
        "Check that create-checkout-session/route.ts sets client_reference_id."
    );
    return;
  }

  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

  if (!subscriptionId) {
    console.error("checkout.session.completed has no subscription id - not a subscription checkout?");
    return;
  }

  // Retrieve the full subscription to get the price ID, plan/billing
  // cycle, and the real current_period_end - none of these are present
  // on the checkout session object itself.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id || null;
  const currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);
  const { plan, billing_cycle } = derivePlanFields(subscription);

  // currency/amount are only available from our own Checkout Session
  // metadata (set in create-checkout-session/route.ts) - Stripe's
  // Subscription/Price object doesn't carry the same "amount the
  // customer was quoted in their chosen currency" concept in one field
  // the way our metadata does, so this one part still reads metadata.
  const currency = session.metadata?.currency || null;
  const amount = session.metadata?.amount ? Number(session.metadata.amount) : null;

  const { data: subscriptionRow, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status: "premium", // matches the existing, already-tested is_user_premium() check -
                            // NOT "active", to avoid silently breaking the Premium badge and
                            // existing access checks that already look for this exact value
        plan,
        billing_cycle,
        currency,
        amount,
        payment_provider: "stripe",
        payment_method: "card",
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        price_id: priceId,
        started_at: new Date().toISOString(),
        expires_at: currentPeriodEnd.toISOString(), // this column already IS "current_period_end"
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("Failed to upsert subscription on checkout completion:", error);
    throw error; // triggers the 500 -> Stripe retry path in the outer catch
  }

  // Canonical dedup key: the Stripe INVOICE id, not the Checkout Session
  // id - this is the same identifier invoice.payment_succeeded's handler
  // below uses for this exact same payment, so whichever event arrives
  // first records the row and the other safely no-ops on the shared
  // unique index (payment_history_provider_reference_unique, migration
  // 044) instead of creating a duplicate. Read directly from the session
  // object itself ("ID of the invoice created by the Checkout Session,
  // if it exists" - Stripe's own field for exactly this purpose), not
  // derived from the subscription, so there is no extra API call and no
  // dependency on subscription state.
  //
  // Deliberately NOT falling back to session.id if this is ever null -
  // a fallback would produce a DIFFERENT reference than
  // invoice.payment_succeeded's invoice.id for the same payment, which
  // would defeat the dedup entirely (both rows would insert, each
  // "unique" under its own different value). Subscription activation
  // above this point is unaffected either way; only the payment_history
  // record for this event is skipped, and invoice.payment_succeeded
  // (which carries its own invoice.id directly, no derivation needed)
  // remains a reliable independent path to record it.
  const invoiceId = typeof session.invoice === "string" ? session.invoice : session.invoice?.id ?? null;

  if (!invoiceId) {
    console.error(
      "checkout.session.completed has no invoice id - skipping payment_history insert " +
        "to avoid recording it under a different reference than invoice.payment_succeeded will use. " +
        `Subscription activation for user ${userId} still proceeded normally. ` +
        "This payment should still be recorded when invoice.payment_succeeded arrives for it."
    );
    return;
  }

  const { error: paymentHistoryError } = await supabaseAdmin.from("payment_history").upsert(
    {
      subscription_id: subscriptionRow.id,
      payment_provider: "stripe",
      payment_method: "card",
      amount: amount ?? 0,
      currency: currency ?? "JPY",
      transaction_reference: invoiceId,
      payment_status: "success",
      payment_date: new Date().toISOString(),
    },
    { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: true }
  );

  if (paymentHistoryError) {
    console.error("Failed to record payment_history on checkout completion:", paymentHistoryError);
    throw paymentHistoryError; // triggers the 500 -> Stripe retry path in the outer catch
  }
}

// === customer.subscription.updated ===
// Fires on renewals, plan changes, and Stripe's own retry-scheduling
// changes. Looks the row up by stripe_customer_id, since this event
// doesn't carry a Supabase user_id directly. Also re-derives plan/
// billing_cycle (not just price_id) so a genuine plan CHANGE (monthly ->
// annual, for example) is reflected correctly, not just the very first
// checkout.
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) return;

  const priceId = subscription.items.data[0]?.price.id || null;
  const currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);
  const { plan, billing_cycle } = derivePlanFields(subscription);

  const status = subscription.cancel_at_period_end
    ? "renewing" // still premium, but will not renew again
    : subscription.status === "active"
      ? "premium"
      : subscription.status === "past_due"
        ? "past_due"
        : "premium";

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status,
      plan,
      billing_cycle,
      price_id: priceId,
      expires_at: currentPeriodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update subscription on customer.subscription.updated:", error);
    throw error;
  }
}

// === customer.subscription.deleted ===
// Fires when a subscription is actually cancelled (immediately, or at
// the end of the period the customer already paid for). Plan/billing
// cycle are deliberately left as-is here - a cancelled subscription
// still had a real plan, no need to null it out on cancellation.
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) return;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update subscription on customer.subscription.deleted:", error);
    throw error;
  }
}

// === invoice.payment_succeeded ===
// Fires on the initial invoice AND every successful renewal. Keeps
// status as premium (in case it had drifted to past_due after a
// previous failed attempt that has now succeeded), refreshes the expiry
// date, and re-derives plan/billing_cycle for the same robustness reason
// as customer.subscription.updated above - this event can also arrive
// for a renewal without customer.subscription.updated necessarily having
// run first.
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : null;

  let currentPeriodEnd: string | undefined;
  let planFields: { plan: "premium_monthly" | "premium_annual" | null; billing_cycle: "monthly" | "annual" | null } = {
    plan: null,
    billing_cycle: null,
  };

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000).toISOString();
    planFields = derivePlanFields(subscription);
  }

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, currency")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "premium",
      ...(planFields.plan ? { plan: planFields.plan } : {}),
      ...(planFields.billing_cycle ? { billing_cycle: planFields.billing_cycle } : {}),
      ...(currentPeriodEnd ? { expires_at: currentPeriodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update subscription on invoice.payment_succeeded:", error);
    throw error;
  }

  if (existing) {
    // Same shared unique index as handleCheckoutCompleted above
    // (payment_history_provider_reference_unique, migration 044) - if
    // this is the initial payment and checkout.session.completed's
    // handler already recorded it under this same invoice.id, this
    // upsert safely no-ops instead of creating a duplicate row. For a
    // renewal, invoice.id is a new, distinct invoice every period, so a
    // fresh row is still inserted exactly as before.
    const { error: paymentHistoryError } = await supabaseAdmin.from("payment_history").upsert(
      {
        subscription_id: existing.id,
        payment_provider: "stripe",
        payment_method: "card",
        amount: (invoice.amount_paid || 0) / (existing.currency === "JPY" ? 1 : 100),
        currency: existing.currency || "JPY",
        transaction_reference: invoice.id,
        payment_status: "success",
        payment_date: new Date().toISOString(),
      },
      { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: true }
    );

    if (paymentHistoryError) {
      console.error("Failed to record payment_history on invoice.payment_succeeded:", paymentHistoryError);
      throw paymentHistoryError;
    }
  }
}

// === invoice.payment_failed ===
// Fails closed by design: access is revoked (status = past_due, not
// counted as premium by is_user_premium()) rather than silently kept
// active during a billing problem. Adjust if you want a grace period.
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update subscription on invoice.payment_failed:", error);
    throw error;
  }
}
