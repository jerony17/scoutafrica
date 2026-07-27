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

  // Retrieve the full subscription to get the price ID and the real
  // current_period_end - neither is present on the checkout session
  // object itself.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id || null;
  const currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status: "premium", // matches the existing, already-tested is_user_premium() check -
                            // NOT "active", to avoid silently breaking the Premium badge and
                            // existing access checks that already look for this exact value
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        price_id: priceId,
        started_at: new Date().toISOString(),
        expires_at: currentPeriodEnd.toISOString(), // this column already IS "current_period_end"
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Failed to upsert subscription on checkout completion:", error);
    throw error; // triggers the 500 -> Stripe retry path in the outer catch
  }
}

// === customer.subscription.updated ===
// Fires on renewals, plan changes, and Stripe's own retry-scheduling
// changes. Looks the row up by stripe_customer_id, since this event
// doesn't carry a Supabase user_id directly.
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!customerId) return;

  const priceId = subscription.items.data[0]?.price.id || null;
  const currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);

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
// the end of the period the customer already paid for).
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
// previous failed attempt that has now succeeded) and refreshes the
// expiry date.
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;

  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : null;

  let currentPeriodEnd: string | undefined;
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    currentPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000).toISOString();
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "premium",
      ...(currentPeriodEnd ? { expires_at: currentPeriodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("Failed to update subscription on invoice.payment_succeeded:", error);
    throw error;
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
