import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import type { BillingCycle, SupportedCurrency } from "../../../lib/pricing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Stripe requires the RAW request body (unparsed) to verify the webhook
// signature - this is why this route reads request.text() instead of
// request.json(), and why it must not run through any body-parsing
// middleware.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      default:
        // Unhandled event types are intentionally ignored, not errors.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    // Return 500 so Stripe retries - the event was verified as authentic,
    // this is a transient processing failure on our side.
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.user_id;
  const billingCycle = session.metadata?.billing_cycle as BillingCycle | undefined;
  const currency = (session.metadata?.currency as SupportedCurrency | undefined) || "JPY";
  const amount = Number(session.metadata?.amount || 0);

  if (!userId || !billingCycle) {
    console.error("checkout.session.completed missing user_id or billing_cycle in metadata");
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now);
  if (billingCycle === "monthly") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  const { data: subscriptionRow, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan: billingCycle === "monthly" ? "premium_monthly" : "premium_annual",
        billing_cycle: billingCycle,
        amount,
        currency,
        payment_provider: "stripe",
        payment_method: "card",
        transaction_id: typeof session.subscription === "string" ? session.subscription : null,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : null,
        status: "premium",
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        cancelled_at: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("Failed to upsert subscription on checkout completion:", error);
    return;
  }

  await supabaseAdmin.from("payment_history").insert({
    subscription_id: subscriptionRow.id,
    payment_provider: "stripe",
    payment_method: "card",
    amount,
    currency,
    transaction_reference: session.id,
    payment_status: "success",
    payment_date: now.toISOString(),
  });
}

// Recurring renewal payments (month 2, 3, ... or year 2, 3, ...)
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subscriptionId) return;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, user_id, billing_cycle, currency")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!existing) return;

  // Skip the very first invoice - handleCheckoutCompleted already logged it.
  if (invoice.billing_reason === "subscription_create") return;

  const now = new Date();
  const expiresAt = new Date(now);
  if (existing.billing_cycle === "monthly") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "premium", expires_at: expiresAt.toISOString(), updated_at: now.toISOString() })
    .eq("id", existing.id);

  await supabaseAdmin.from("payment_history").insert({
    subscription_id: existing.id,
    payment_provider: "stripe",
    payment_method: "card",
    amount: (invoice.amount_paid || 0) / (existing.currency === "JPY" ? 1 : 100),
    currency: existing.currency,
    transaction_reference: invoice.id,
    payment_status: "success",
    payment_date: now.toISOString(),
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : null;
  if (!subscriptionId) return;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, currency")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!existing) return;

  await supabaseAdmin.from("payment_history").insert({
    subscription_id: existing.id,
    payment_provider: "stripe",
    payment_method: "card",
    amount: (invoice.amount_due || 0) / (existing.currency === "JPY" ? 1 : 100),
    currency: existing.currency,
    transaction_reference: invoice.id,
    payment_status: "failed",
    payment_date: new Date().toISOString(),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const status = subscription.cancel_at_period_end ? "renewing" : "premium";

  await supabaseAdmin
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);
}
