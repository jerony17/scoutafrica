import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingCycle, SupportedCurrency } from "../../../lib/pricing";

// Event handlers for the Paystack webhook, factored out of route.ts so they
// can be unit tested directly (Next.js route files may only export the
// framework-recognized HTTP-method names, so testable logic can't live
// there). route.ts remains the only place that owns signature verification
// and dispatch; it passes its own `supabaseAdmin` instance in here rather
// than this module importing it directly, which is what lets tests supply a
// fake client instead of a real database connection.
//
// handleChargeSuccess and the subscription-status handlers delegate the
// actual charge/cancellation logic to apply_paystack_charge_success and
// apply_paystack_subscription_status (migration
// 20261004133306_paystack_atomic_charge_and_cancellation.sql) - atomic,
// SECURITY DEFINER Postgres functions that replace what used to be
// multi-round-trip application logic here. That logic had a confirmed
// renewal-concurrency race and a write-before-detect bug in cancellation's
// ambiguous-match handling; both are closed inside the database functions
// themselves (advisory locks, row locking, count-before-write), not here.

export interface PaystackEvent {
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
// cause a staged event to be permanently missed (see handleChargeSuccess).
export async function handleSubscriptionCreate(event: PaystackEvent, admin: SupabaseClient) {
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

  const { error: stageError } = await admin.from("paystack_pending_events").upsert(
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
  const { error: reconcileError } = await admin.rpc("reconcile_paystack_pending_events", {
    p_customer_code: customerCode,
  });

  if (reconcileError) {
    console.error(
      "Failed to reconcile Paystack subscription.create event after staging:",
      reconcileError.message
    );
  }
}

// charge.success: delegates to apply_paystack_charge_success, which
// handles both first-time activation (metadata present) and renewal
// (metadata absent, resolved by subscription_code/customer_code)
// atomically - see the migration file for the full design rationale.
export async function handleChargeSuccess(event: PaystackEvent, admin: SupabaseClient) {
  const metadata = event.data.metadata;
  const customerCode = event.data.customer?.customer_code;
  const subscriptionCode = event.data.subscription_code;
  const amount = (event.data.amount || 0) / 100; // Paystack sends amounts in the smallest unit

  // Metadata present (first-time activation, our own trusted data):
  // default to NGN exactly as before if the event itself omits currency.
  // Metadata absent (renewal): do NOT default locally - pass the event's
  // own currency through as-is (possibly absent), so the database
  // function falls back to the subscription's own stored currency instead
  // of a locally-guessed one. Defaulting here would defeat that fallback,
  // since the function would then never see a NULL to fall back from.
  const hasTrustedMetadata = Boolean(metadata?.user_id && metadata?.billing_cycle);
  const currency = hasTrustedMetadata
    ? (event.data.currency as SupportedCurrency) || metadata?.currency || "NGN"
    : (event.data.currency as SupportedCurrency) || undefined;

  const { data, error } = await admin.rpc("apply_paystack_charge_success", {
    p_reference: event.data.reference ?? null,
    p_amount: amount,
    p_currency: currency ?? null,
    p_payment_method: event.data.authorization?.channel || "paystack",
    p_user_id: metadata?.user_id ?? null,
    p_billing_cycle: metadata?.billing_cycle ?? null,
    p_subscription_code: subscriptionCode ?? null,
    p_customer_code: customerCode ?? null,
  });

  if (error) {
    // Must not acknowledge success - propagate so the outer handler
    // returns a non-2xx instead of a false 200.
    console.error("Failed to apply Paystack charge.success:", { message: error.message, code: error.code });
    throw error;
  }

  const result = data?.[0];
  if (!result) {
    throw new Error("apply_paystack_charge_success returned no row");
  }
  if (!result.applied) {
    // Benign: a redelivered, already-applied charge. Still a 200 - no
    // further action needed, but worth a log line for visibility.
    console.log("Paystack charge.success was a benign duplicate:", result.reason);
  }

  // Opportunistic reconciliation of any subscription.create event(s)
  // already staged for this customer (see 048_paystack_pending_events.sql).
  // Called regardless of applied vs. duplicate above - harmless to call
  // redundantly, and this is the other half of the ordering guarantee
  // alongside handleSubscriptionCreate's own reconcile attempt.
  if (customerCode) {
    const { error: reconcileError } = await admin.rpc("reconcile_paystack_pending_events", {
      p_customer_code: customerCode,
    });
    if (reconcileError) {
      console.error(
        "Failed to reconcile staged Paystack subscription.create event:",
        reconcileError.message
      );
    }
  }
}

// subscription.disable and subscription.not_renew both delegate to
// apply_paystack_subscription_status, which derives the correct
// status/cancelled_at behavior from the event type itself - see the
// migration file for the disable-vs-not_renew semantics this preserves.
export async function handleSubscriptionStatusChange(event: PaystackEvent, admin: SupabaseClient) {
  const subscriptionCode = event.data.subscription_code;

  const { data, error } = await admin.rpc("apply_paystack_subscription_status", {
    p_subscription_code: subscriptionCode ?? null,
    p_event_type: event.event,
  });

  if (error) {
    console.error(`Failed to update subscription on Paystack ${event.event}:`, {
      subscriptionCode,
      code: error.code,
    });
    throw error;
  }

  // Defensive, matching handleChargeSuccess: the SQL function's contract
  // is to always return exactly one row when it doesn't raise, but an
  // empty/malformed result must never be treated as a silent success.
  const result = data?.[0];
  if (!result) {
    throw new Error("apply_paystack_subscription_status returned no row");
  }
}

export async function handlePaymentFailed(event: PaystackEvent, admin: SupabaseClient) {
  const subscriptionCode = event.data.subscription_code;
  if (!subscriptionCode) return;

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id, currency")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();

  if (!existing) return;

  // Same shared unique index as above. Deliberately ignoreDuplicates:
  // TRUE (the opposite of handleChargeSuccess above) - this protects a
  // genuine success record from ever being downgraded to 'failed' if
  // this event arrives after, or out of order with, a success event for
  // the same reference.
  const { error: paymentHistoryError } = await admin.from("payment_history").upsert(
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
    console.error(
      "Failed to record payment_history on Paystack payment failure:",
      paymentHistoryError.message
    );
  }
}
