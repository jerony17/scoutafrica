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
    status?: string;
    // customer.customer_code: confirmed via a real Paystack Test Mode
    // charge.success event (inspected through temporary diagnostic
    // logging, since removed) that charge.success nests customer_code
    // the same way subscription.create's documented payload does
    // (data.customer.customer_code). No longer an assumption.
    customer?: { email?: string; customer_code?: string };
    authorization?: { authorization_code?: string; channel?: string; card_type?: string };
    metadata?: {
      user_id?: string;
      billing_cycle?: BillingCycle;
      currency?: SupportedCurrency;
      amount?: number;
    };
    subscription_code?: string;
    next_payment_date?: string;
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
      case "subscription.create":
        await handleSubscriptionCreate(event);
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

  // event.data.customer?.customer_code: confirmed via a real Paystack
  // Test Mode charge.success event (see the PaystackEvent interface
  // comment above) that this nested shape is correct - no longer an
  // unverified assumption.
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
        paystack_customer_code: event.data.customer?.customer_code || null,
        paystack_subscription_code: event.data.subscription_code || null,
        status: "premium",
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        cancelled_at: null,
        updated_at: now.toISOString(),
        // Switching provider to Paystack - clear fields that only ever
        // applied to a prior Stripe subscription on this same row, so a
        // provider-switched account doesn't keep a stale Stripe identity
        // sitting alongside its current Paystack one.
        stripe_subscription_id: null,
        stripe_customer_id: null,
        price_id: null,
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (error) {
    // Must not acknowledge success - propagate so the outer handler
    // returns a non-2xx instead of a false 200.
    console.error("Failed to upsert subscription on Paystack charge success:", error);
    throw error;
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
    // Also must not acknowledge success - a payment that genuinely
    // succeeded at Paystack but was never recorded in payment_history is
    // exactly the kind of database-operation failure that must not be
    // silently acked. A redelivery safely re-runs the (idempotent) main
    // upsert above and gets another chance at this insert.
    console.error("Failed to record payment_history on Paystack charge success:", paymentHistoryError);
    throw paymentHistoryError;
  }

  // Opportunistic reconciliation of any subscription.create event(s)
  // already staged for this customer (see 048_paystack_pending_events.sql
  // - reconcile_paystack_pending_events runs the match/apply/cleanup as
  // one Postgres transaction, not separate DELETE+UPDATE calls). Soft-
  // fails on purpose: the core job of this charge.success event (payment
  // recorded, subscription active) already succeeded above regardless of
  // whether reconciliation succeeds, and handleSubscriptionCreate below
  // also attempts this same reconciliation after staging - between the
  // two, at least one attempt is guaranteed to run after both this row's
  // customer_code and the staged event exist (see the PR/report for the
  // interleaving proof), so a failure here isn't the only chance.
  const customerCode = event.data.customer?.customer_code;
  if (customerCode) {
    const { error: reconcileError } = await supabaseAdmin.rpc("reconcile_paystack_pending_events", {
      p_customer_code: customerCode,
    });
    if (reconcileError) {
      console.error("Failed to reconcile staged Paystack subscription.create event:", reconcileError);
    }
  }
}

// subscription.create fields used here are the ones confirmed from
// Paystack's documentation: data.subscription_code, data.customer.customer_code,
// data.status, data.amount, data.next_payment_date, data.plan.interval,
// data.plan.plan_code. Only subscription_code and next_payment_date are
// actually WRITTEN to subscriptions (inside reconcile_paystack_pending_events)
// - status/amount/plan.interval are available in the staged payload but
// deliberately not persisted: this app's own status/billing_cycle values
// are a closed set used throughout premium-access logic elsewhere, and
// charge.success (driven by our own trusted metadata) already sets them
// correctly. Writing an unverified Paystack string directly into those
// columns risks a mismatch with no corresponding confirmed mapping -
// worse than leaving them as charge.success already set them.
//
// STAGE FIRST, ALWAYS: this event is durably staged unconditionally
// before anything else is attempted - there is no "check for a match,
// then decide whether to stage" step that could leave a window where the
// event is neither applied nor staged. Reconciliation is then attempted
// opportunistically via the same function charge.success also calls (see
// migration 048) - between the two call sites, event ordering can't
// cause a staged event to be permanently missed (see the comment in
// handleChargeSuccess above).
async function handleSubscriptionCreate(event: PaystackEvent) {
  const subscriptionCode = event.data.subscription_code;
  const customerCode = event.data.customer?.customer_code;

  // TEMPORARY DIAGNOSTIC - remove this console.log block once the real
  // subscription.create next_payment_date format is confirmed. Logs only
  // booleans and the JS typeof string - no raw value, no payload
  // contents, no customer/payment data, no secrets.
  const rawNextPaymentDate = event.data.next_payment_date;
  console.log("DIAGNOSTIC subscription.create next_payment_date shape:", {
    isPresent: rawNextPaymentDate !== undefined && rawNextPaymentDate !== null,
    typeofValue: typeof rawNextPaymentDate,
    isValidDate:
      rawNextPaymentDate !== undefined &&
      rawNextPaymentDate !== null &&
      !isNaN(new Date(rawNextPaymentDate).getTime()),
  });

  if (!subscriptionCode || !customerCode) {
    console.error("Paystack subscription.create missing subscription_code or customer.customer_code");
    return;
  }

  const { error: stageError } = await supabaseAdmin.from("paystack_pending_events").upsert(
    {
      subscription_code: subscriptionCode,
      customer_code: customerCode,
      event_type: event.event,
      payload: event.data,
    },
    { onConflict: "subscription_code", ignoreDuplicates: true }
  );

  if (stageError) {
    // Not durably staged - must not acknowledge this event.
    throw stageError;
  }

  // Soft-fails: the event is already durably staged regardless of
  // whether this immediate attempt succeeds, so a failure here must not
  // throw - handleChargeSuccess's own reconciliation call remains the
  // guaranteed fallback.
  const { error: reconcileError } = await supabaseAdmin.rpc("reconcile_paystack_pending_events", {
    p_customer_code: customerCode,
  });

  if (reconcileError) {
    console.error("Failed to reconcile Paystack subscription.create event after staging:", reconcileError);
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
