import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import type { BillingCycle, SupportedCurrency } from "../../../lib/pricing";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

interface PaystackEvent {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string };
    authorization?: { authorization_code?: string; channel?: string; card_type?: string };
    metadata?: {
      user_id?: string;
      billing_cycle?: BillingCycle;
      currency?: SupportedCurrency;
      amount?: number;
    };
    subscription_code?: string;
    customer_code?: string;
    plan?: { plan_code?: string; interval?: string };
  };
}

// Paystack signs the RAW request body with HMAC-SHA512 using your secret
// key, sent as the x-paystack-signature header. This must be verified
// before trusting anything in the payload - exactly like Stripe's
// signature check, just a different algorithm.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Paystack webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event);
        break;
      case "subscription.disable":
      case "subscription.not_renew":
        await handleSubscriptionDisabled(event);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event);
        break;
      default:
        // Unhandled event types are intentionally ignored, not errors.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Paystack webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

async function handleChargeSuccess(event: PaystackEvent) {
  const metadata = event.data.metadata;
  const userId = metadata?.user_id;
  const billingCycle = metadata?.billing_cycle;

  if (!userId || !billingCycle) {
    console.error("Paystack charge.success missing user_id or billing_cycle in metadata");
    return;
  }

  const currency = (event.data.currency as SupportedCurrency) || metadata?.currency || "NGN";
  const amount = (event.data.amount || 0) / 100; // Paystack sends amounts in the smallest unit

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
        payment_provider: "paystack",
        payment_method: event.data.authorization?.channel || "paystack",
        transaction_id: event.data.reference || null,
        paystack_customer_code: event.data.customer_code || null,
        paystack_subscription_code: event.data.subscription_code || null,
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
    console.error("Failed to upsert subscription on Paystack charge success:", error);
    return;
  }

  // Same shared unique index as the Stripe handlers
  // (payment_history_provider_reference_unique, migration 044).
  // Deliberately ignoreDuplicates: FALSE (a real upsert, not "do
  // nothing") - unlike handlePaymentFailed below, success must always be
  // allowed to overwrite an existing row for this reference. Paystack's
  // subscription-invoice failure/retry reference semantics aren't fully
  // documented publicly, so this can't be ruled out with certainty: if a
  // 'failed' row for this exact reference was recorded earlier and the
  // charge has now actually succeeded, this event must be able to
  // upgrade that row to 'success' rather than being silently dropped by
  // a DO NOTHING conflict resolution. A same-event retry redelivery is
  // still handled safely - it just re-writes the same success data,
  // which is harmless.
  const { error: paymentHistoryError } = await supabaseAdmin.from("payment_history").upsert(
    {
      subscription_id: subscriptionRow.id,
      payment_provider: "paystack",
      payment_method: event.data.authorization?.channel || "paystack",
      amount,
      currency,
      transaction_reference: event.data.reference,
      payment_status: "success",
      payment_date: now.toISOString(),
    },
    { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: false }
  );

  if (paymentHistoryError) {
    console.error("Failed to record payment_history on Paystack charge success:", paymentHistoryError);
  }
}

async function handleSubscriptionDisabled(event: PaystackEvent) {
  const subscriptionCode = event.data.subscription_code;
  if (!subscriptionCode) return;

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);
}

async function handlePaymentFailed(event: PaystackEvent) {
  const subscriptionCode = event.data.subscription_code;
  if (!subscriptionCode) return;

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, currency")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();

  if (!existing) return;

  // Same shared unique index as above. Deliberately ignoreDuplicates:
  // TRUE (the opposite of handleChargeSuccess above) - this protects a
  // genuine success record from ever being downgraded to 'failed' if
  // this event arrives after, or out of order with, a success event for
  // the same reference. It also makes a redelivered/retried copy of this
  // exact failure event a safe no-op rather than a duplicate row.
  // Failure is intentionally the "weaker" event here: it may record a
  // new row, but it may never overwrite one that already exists.
  const { error: paymentHistoryError } = await supabaseAdmin.from("payment_history").upsert(
    {
      subscription_id: existing.id,
      payment_provider: "paystack",
      payment_method: "paystack",
      amount: (event.data.amount || 0) / 100,
      currency: existing.currency || "NGN",
      transaction_reference: event.data.reference,
      payment_status: "failed",
      payment_date: new Date().toISOString(),
    },
    { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: true }
  );

  if (paymentHistoryError) {
    console.error("Failed to record payment_history on Paystack payment failure:", paymentHistoryError);
  }
}
