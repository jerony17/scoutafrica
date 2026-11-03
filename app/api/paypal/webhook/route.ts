import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { getAmountForCycle } from "../../../lib/pricing";
import {
  PAYPAL_CURRENCY,
  PayPalApiError,
  PayPalUnavailableError,
  cancelSubscription,
  cycleForPlanId,
  getPayPalConfig,
  getSubscription,
  listSubscriptionTransactions,
  verifyWebhookSignature,
  type PayPalSubscription,
} from "../../../lib/paypal";
import {
  conflictingSubscription,
  deriveAccessStatus,
  findConfirmedPayment,
  isUserId,
  laterExpiry,
  paidUntil,
  type PayPalBillingCycle,
  type PayPalTransaction,
} from "../../../lib/paypalBilling";

type PayPalConfig = ReturnType<typeof getPayPalConfig>;

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    billing_agreement_id?: string;
  };
}

// Thrown for conditions that should NOT be retried by PayPal (the event is
// authentic but can never apply, e.g. a plan that isn't ours). Logged and
// acknowledged with 200 instead of 500.
class IgnoredEvent extends Error {}

// SECURITY: nothing in the request body is trusted until PayPal confirms
// the signature (verify-webhook-signature). Even after that, Premium is
// never granted from the event payload itself: every handler re-fetches
// the subscription from PayPal, and a payment only counts once it appears
// in PayPal's own transaction list for that subscription as COMPLETED
// with the exact expected USD amount. Approval/activation alone grants
// nothing, and expiry only ever moves forward on a confirmed payment.
export async function POST(request: NextRequest) {
  let config: PayPalConfig;
  try {
    config = getPayPalConfig();
  } catch (error) {
    if (error instanceof PayPalUnavailableError) {
      console.warn("PayPal webhook refused:", error.message);
      return NextResponse.json({ error: "PayPal is not available." }, { status: 503 });
    }
    throw error;
  }

  const rawBody = await request.text();

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const verified = await verifyWebhookSignature(config, request.headers, rawBody);
    if (!verified) {
      console.error("PayPal webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch (error) {
    // Couldn't reach PayPal to verify - not the same as a bad signature.
    console.error("PayPal webhook verification error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Verification unavailable" }, { status: 500 });
  }

  const eventType = event.event_type ?? "";

  try {
    switch (eventType) {
      case "PAYMENT.SALE.COMPLETED":
        await handlePaymentCompleted(config, event);
        break;

      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
      case "BILLING.SUBSCRIPTION.UPDATED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        await handleSubscriptionLifecycle(config, event);
        break;

      case "PAYMENT.SALE.REFUNDED":
      case "PAYMENT.SALE.REVERSED":
        await handleRefundOrReversal(event);
        break;

      default:
        // BILLING.SUBSCRIPTION.CREATED and every other type: nothing to do.
        // A created/approved subscription has not been paid for.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof IgnoredEvent) {
      console.warn(`PayPal ${eventType} (${event.id}) ignored: ${error.message}`);
      return NextResponse.json({ received: true });
    }
    if (error instanceof PayPalApiError && error.status === 404) {
      console.warn(`PayPal ${eventType} (${event.id}) refers to a resource PayPal no longer has: ${error.message}`);
      return NextResponse.json({ received: true });
    }
    // 500 -> PayPal redelivers. Every write below is idempotent, so a
    // retry after a partial failure is safe.
    console.error(`PayPal webhook handler failed for ${eventType} (${event.id}):`, error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

interface OwnedSubscription {
  subscription: PayPalSubscription;
  userId: string;
  cycle: PayPalBillingCycle;
}

// Re-fetches the subscription from PayPal and checks it is one of ours:
// a configured ScoutAfrica plan, carrying a ScoutAfrica user id that we
// set ourselves as custom_id when creating it.
async function fetchOwnedSubscription(config: PayPalConfig, subscriptionId: string): Promise<OwnedSubscription> {
  const subscription = await getSubscription(config, subscriptionId);

  const cycle = cycleForPlanId(config, subscription.plan_id);
  if (!cycle) {
    throw new IgnoredEvent(`subscription ${subscription.id} uses plan ${subscription.plan_id ?? "?"}, not a ScoutAfrica plan`);
  }
  if (!isUserId(subscription.custom_id)) {
    throw new IgnoredEvent(`subscription ${subscription.id} has no valid ScoutAfrica user id in custom_id`);
  }

  return { subscription, userId: subscription.custom_id, cycle };
}

async function loadSubscriptionRow(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, expires_at, payment_provider, paypal_subscription_id, started_at, cancelled_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Stops future charges on a subscription we refuse to link. 422 means
// PayPal already considers it not cancellable (already cancelled/expired),
// which is the goal - so a redelivered event is safe to process again.
async function cancelRejectedSubscription(config: PayPalConfig, subscriptionId: string) {
  try {
    await cancelSubscription(config, subscriptionId, "Duplicate or conflicting ScoutAfrica subscription - cancelled automatically");
  } catch (error) {
    if (!(error instanceof PayPalApiError && error.status === 422)) {
      throw error; // 500 -> PayPal redelivers and the cancel is retried
    }
  }
}

function describeAmount(transaction: PayPalTransaction) {
  const amount = transaction.amount_with_breakdown?.gross_amount;
  return `${amount?.value ?? "?"} ${amount?.currency_code ?? "?"}`;
}

// === PAYMENT.SALE.COMPLETED ===
// The only event that can grant or extend Premium.
async function handlePaymentCompleted(config: PayPalConfig, event: PayPalWebhookEvent) {
  const transactionId = event.resource?.id;
  // billing_agreement_id is how a subscription payment names its
  // subscription. Not covered by PayPal's subscription docs pages -
  // confirm the field in Sandbox before go-live.
  const subscriptionId = event.resource?.billing_agreement_id;

  if (!transactionId || !subscriptionId) {
    throw new IgnoredEvent("payment event has no transaction id or billing_agreement_id");
  }

  const { subscription, userId, cycle } = await fetchOwnedSubscription(config, subscriptionId);
  const expectedAmount = getAmountForCycle(PAYPAL_CURRENCY, cycle);

  const now = new Date();
  const transactions = await listSubscriptionTransactions(
    config,
    subscription.id,
    new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000),
    new Date(now.getTime() + 24 * 60 * 60 * 1000)
  );

  const check = findConfirmedPayment(transactions, transactionId, {
    currency: PAYPAL_CURRENCY,
    amount: expectedAmount,
  });

  if (!check.ok) {
    if (check.retryable) {
      throw new Error(`payment not confirmed yet: ${check.reason}`); // 500 -> PayPal retries
    }
    throw new IgnoredEvent(`payment rejected: ${check.reason}`);
  }

  const row = await loadSubscriptionRow(userId);

  // Never take over a live subscription from another provider, and never
  // replace a paid-up PayPal subscription with a second one (checkout
  // approved twice). create-subscription refuses these up front; this is
  // the backstop. Ignoring the payment is not enough - PayPal would keep
  // charging the rejected subscription every period - so it is cancelled
  // at PayPal first, then logged loudly for a manual refund of this payment.
  const conflict = conflictingSubscription(row, subscription.id);
  if (conflict) {
    await cancelRejectedSubscription(config, subscription.id);
    console.error(
      `PayPal payment ${transactionId} (${describeAmount(check.transaction)}) for user ${userId} on subscription ` +
        `${subscription.id} NOT applied (${conflict}; linked provider ${row?.payment_provider ?? "none"}). ` +
        "The PayPal subscription has been cancelled. Refund this payment manually."
    );
    throw new IgnoredEvent(`conflicting subscription (${conflict}) - cancelled at PayPal`);
  }

  const sameSubscription = row?.payment_provider === "paypal" && row.paypal_subscription_id === subscription.id;
  const expiresAt = laterExpiry(sameSubscription ? row.expires_at : null, paidUntil(check.transaction.time, cycle));
  const status = deriveAccessStatus(subscription.status, expiresAt.toISOString()) ?? "pending";
  const gross = check.transaction.amount_with_breakdown!.gross_amount!;

  const { data: subscriptionRow, error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        status,
        plan: cycle === "monthly" ? "premium_monthly" : "premium_annual",
        billing_cycle: cycle,
        amount: expectedAmount,
        currency: PAYPAL_CURRENCY,
        payment_provider: "paypal",
        payment_method: "paypal",
        paypal_subscription_id: subscription.id,
        paypal_plan_id: subscription.plan_id,
        started_at: sameSubscription && row.started_at ? row.started_at : check.transaction.time,
        expires_at: expiresAt.toISOString(),
        cancelled_at: status === "premium" ? null : (row?.cancelled_at ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (error) throw error;

  // Shared unique index (payment_provider, transaction_reference) from
  // migration 044: a redelivered event for the same transaction no-ops.
  const { error: historyError } = await supabaseAdmin.from("payment_history").upsert(
    {
      subscription_id: subscriptionRow.id,
      payment_provider: "paypal",
      payment_method: "paypal",
      amount: Number(gross.value),
      currency: gross.currency_code,
      transaction_reference: transactionId,
      payment_status: "success",
      payment_date: check.transaction.time,
    },
    { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: true }
  );

  if (historyError) throw historyError;
}

// === BILLING.SUBSCRIPTION.* ===
// Reflects PayPal's current state onto an already-linked row. Never
// grants new time: ACTIVATED without a confirmed payment stays 'pending'
// (or unchanged), and CANCELLED/SUSPENDED keep only time already paid for
// ('renewing' until expires_at, the same meaning as a Stripe
// cancel-at-period-end). A subscription that has never had a confirmed
// payment has no row to update - the first payment links it.
async function handleSubscriptionLifecycle(config: PayPalConfig, event: PayPalWebhookEvent) {
  const subscriptionId = event.resource?.id;
  if (!subscriptionId) {
    throw new IgnoredEvent("subscription event has no resource id");
  }

  const { subscription, userId, cycle } = await fetchOwnedSubscription(config, subscriptionId);
  const row = await loadSubscriptionRow(userId);

  if (!row || row.payment_provider !== "paypal" || row.paypal_subscription_id !== subscription.id) {
    // Not linked yet (no confirmed payment) - nothing to change.
    return;
  }

  const status = deriveAccessStatus(subscription.status, row.expires_at);
  if (status && status !== row.status) {
    const endsRenewal = subscription.status === "CANCELLED" || subscription.status === "SUSPENDED";
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        status,
        // Re-activated after a suspension: renewing again, same rule as a
        // confirmed payment (premium clears cancelled_at).
        cancelled_at: endsRenewal
          ? (row.cancelled_at ?? new Date().toISOString())
          : status === "premium"
            ? null
            : row.cancelled_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) throw error;
  }

  if (event.event_type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" && event.id) {
    // One row per failure event (event id as the reference, so a
    // redelivery no-ops). Doesn't revoke anything: paid time already
    // ends on its own at expires_at.
    const { error } = await supabaseAdmin.from("payment_history").upsert(
      {
        subscription_id: row.id,
        payment_provider: "paypal",
        payment_method: "paypal",
        amount: getAmountForCycle(PAYPAL_CURRENCY, cycle),
        currency: PAYPAL_CURRENCY,
        transaction_reference: `failed:${event.id}`,
        payment_status: "failed",
        payment_date: new Date().toISOString(),
      },
      { onConflict: "payment_provider,transaction_reference", ignoreDuplicates: true }
    );

    if (error) throw error;
  }
}

// === PAYMENT.SALE.REFUNDED / REVERSED ===
// Marks the recorded payment as refunded. Access is NOT revoked
// automatically here (a partial or goodwill refund shouldn't necessarily
// end membership) - logged for an admin decision instead.
async function handleRefundOrReversal(event: PayPalWebhookEvent) {
  const resource = event.resource as { id?: string; sale_id?: string } | undefined;
  const saleId = event.event_type === "PAYMENT.SALE.REFUNDED" ? resource?.sale_id : resource?.id;

  if (!saleId) {
    throw new IgnoredEvent("refund/reversal event has no sale id");
  }

  const { data, error } = await supabaseAdmin
    .from("payment_history")
    .update({ payment_status: "refunded" })
    .eq("payment_provider", "paypal")
    .eq("transaction_reference", saleId)
    .select("subscription_id");

  if (error) throw error;

  if (data && data.length > 0) {
    console.warn(
      `PayPal ${event.event_type} for payment ${saleId} (subscription row ${data[0].subscription_id}) - ` +
        "payment marked refunded; review whether Premium access should be ended."
    );
  }
}
