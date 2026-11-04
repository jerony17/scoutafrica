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
import {
  guardRevokedRenewal,
  processRefundEvent,
  type PayPalCancellation,
  type RefundDeps,
  type RevokedRenewalDeps,
} from "../../../lib/paypalRefunds";
import { OUTGOING_TIMEOUT_MS } from "../../../lib/httpTimeout";

type PayPalConfig = ReturnType<typeof getPayPalConfig>;

// Every Supabase call in this webhook gets the same deadline as the PayPal
// calls. An aborted write may still have committed - every write here is
// idempotent, so the 500 + PayPal redelivery that follows is safe.
const dbDeadline = () => AbortSignal.timeout(OUTGOING_TIMEOUT_MS);

// One structured line per delivery (see logDelivery). Ids and outcomes
// only - no credentials, tokens, payer names or emails.
interface DeliveryLog {
  event_id: string | null;
  event_type: string | null;
  transmission_id: string | null;
  signature: "not_checked" | "verified" | "invalid" | "unavailable";
  outcome: string | null;
  detail: string | null;
  cancellation: PayPalCancellation | null;
  needs_review: boolean;
}

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    billing_agreement_id?: string;
    sale_id?: string;
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
  const started = Date.now();
  const log: DeliveryLog = {
    event_id: null,
    event_type: null,
    transmission_id: logSafe(request.headers.get("paypal-transmission-id")),
    signature: "not_checked",
    outcome: null,
    detail: null,
    cancellation: null,
    needs_review: false,
  };

  let status = 500; // if handleDelivery throws, Next.js answers 500
  try {
    const response = await handleDelivery(request, log);
    status = response.status;
    return response;
  } finally {
    logDelivery(log, status, Date.now() - started);
  }
}

// Ids from an unverified body are still useful for tracing (the
// "signature" field says whether they were verified); bounded so a forged
// request can't flood the log line.
function logSafe(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 128) : null;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, 500);
}

// Search the Vercel logs for "paypal_webhook" (every delivery) or
// "needs_review":true (cases for docs/paypal-refund-review.md).
function logDelivery(log: DeliveryLog, httpStatus: number, durationMs: number) {
  const line = JSON.stringify({
    msg: "paypal_webhook",
    ...log,
    outcome: log.outcome ?? "unknown",
    http_status: httpStatus,
    retry: httpStatus >= 500, // PayPal redelivers any non-2xx; 400s are never valid later
    duration_ms: durationMs,
  });
  if (httpStatus >= 500 || log.needs_review) {
    console.error(line);
  } else if (httpStatus >= 400) {
    console.warn(line);
  } else {
    console.log(line);
  }
}

async function handleDelivery(request: NextRequest, log: DeliveryLog): Promise<NextResponse> {
  let config: PayPalConfig;
  try {
    config = getPayPalConfig();
  } catch (error) {
    if (error instanceof PayPalUnavailableError) {
      log.outcome = "paypal_unavailable";
      log.detail = error.message;
      return NextResponse.json({ error: "PayPal is not available." }, { status: 503 });
    }
    throw error;
  }

  const rawBody = await request.text();

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    log.outcome = "invalid_json";
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  log.event_id = logSafe(event.id);
  log.event_type = logSafe(event.event_type);

  try {
    const verified = await verifyWebhookSignature(config, request.headers, rawBody);
    if (!verified) {
      log.signature = "invalid";
      log.outcome = "rejected";
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    log.signature = "verified";
  } catch (error) {
    // Couldn't reach PayPal to verify - not the same as a bad signature.
    log.signature = "unavailable";
    log.outcome = "verification_unavailable";
    log.detail = errorText(error);
    return NextResponse.json({ error: "Verification unavailable" }, { status: 500 });
  }

  const eventType = event.event_type ?? "";

  try {
    switch (eventType) {
      case "PAYMENT.SALE.COMPLETED":
        await handlePaymentCompleted(config, event, log);
        break;

      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
      case "BILLING.SUBSCRIPTION.UPDATED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        await handleSubscriptionLifecycle(config, event, log);
        break;

      case "PAYMENT.SALE.REFUNDED":
      case "PAYMENT.SALE.REVERSED":
        await handleRefundOrReversal(config, event, log);
        break;

      default:
        // BILLING.SUBSCRIPTION.CREATED and every other type: nothing to do.
        // A created/approved subscription has not been paid for.
        log.outcome = "no_action";
        break;
    }

    log.outcome ??= "processed";
    return NextResponse.json({ received: true });
  } catch (error) {
    // Handlers that already set an outcome keep it; detail explains why.
    if (error instanceof IgnoredEvent) {
      log.outcome ??= "ignored";
      log.detail ??= error.message;
      return NextResponse.json({ received: true });
    }
    if (error instanceof PayPalApiError && error.status === 404) {
      log.outcome ??= "resource_gone";
      log.detail ??= error.message;
      return NextResponse.json({ received: true });
    }
    // 500 -> PayPal redelivers. Every write below is idempotent, so a
    // retry after a partial failure is safe (RequestTimeoutError included).
    log.outcome ??= "failed";
    log.detail ??= errorText(error);
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
    .abortSignal(dbDeadline())
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
async function handlePaymentCompleted(config: PayPalConfig, event: PayPalWebhookEvent, log: DeliveryLog) {
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

  // A refunded or reversed sale never grants time again, even if this
  // event is redelivered and PayPal still lists the sale as COMPLETED.
  const { data: recorded, error: recordedError } = await supabaseAdmin
    .from("payment_history")
    .select("payment_status")
    .eq("payment_provider", "paypal")
    .eq("transaction_reference", transactionId)
    .abortSignal(dbDeadline())
    .maybeSingle();
  if (recordedError) throw recordedError;
  if (recorded?.payment_status === "refunded" || recorded?.payment_status === "reversed") {
    throw new IgnoredEvent(`payment ${transactionId} is already recorded as ${recorded.payment_status}`);
  }

  // A subscription whose access was revoked by a full refund/reversal never
  // gets Premium again - even if its cancel failed and PayPal charged a
  // renewal. Cancel again and flag the payment for a manual refund.
  const renewal = await guardRevokedRenewal(revokedRenewalDeps(config), subscription.id, transactionId);
  if (renewal.blocked) {
    log.outcome = "renewal_blocked_after_revocation";
    log.cancellation = renewal.cancellation;
    log.needs_review = true;
    log.detail = `refund event ${renewal.refundEventId}: ${renewal.reason}`.slice(0, 500);
    if (renewal.retry) {
      throw new Error("renewal blocked but PayPal cancellation not confirmed - PayPal will redeliver"); // 500
    }
    throw new IgnoredEvent("renewal blocked after revocation");
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
    log.outcome = "conflict_cancelled";
    log.needs_review = true;
    throw new IgnoredEvent(`conflicting subscription (${conflict}) - cancelled at PayPal; refund payment ${transactionId} manually`);
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
    .abortSignal(dbDeadline())
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
  ).abortSignal(dbDeadline());

  if (historyError) throw historyError;
  log.outcome = `access_${status}`;
  log.detail = `expires ${expiresAt.toISOString()}`;
}

function revokedRenewalDeps(config: PayPalConfig): RevokedRenewalDeps {
  return {
    async findRevokedRefundEvent(paypalSubscriptionId) {
      const { data, error } = await supabaseAdmin
        .from("paypal_refund_events")
        .select("id, paypal_event_id, review_reason")
        .eq("paypal_subscription_id", paypalSubscriptionId)
        .eq("outcome", "access_revoked")
        .order("created_at", { ascending: false })
        .limit(1)
        .abortSignal(dbDeadline());
      if (error) throw error;
      const row = data?.[0];
      return row ? { id: row.id, eventId: row.paypal_event_id, reviewReason: row.review_reason } : null;
    },
    getSubscriptionStatus: async (subscriptionId) => (await getSubscription(config, subscriptionId)).status,
    cancelSubscription: (subscriptionId, reason) => cancelSubscription(config, subscriptionId, reason),
    async flagForReview(eventRowId, reviewReason, cancellation) {
      const { error } = await supabaseAdmin
        .from("paypal_refund_events")
        .update({ review_reason: reviewReason, paypal_cancellation: cancellation, updated_at: new Date().toISOString() })
        .eq("id", eventRowId)
        .abortSignal(dbDeadline());
      if (error) throw error;
    },
  };
}

// === BILLING.SUBSCRIPTION.* ===
// Reflects PayPal's current state onto an already-linked row. Never
// grants new time: ACTIVATED without a confirmed payment stays 'pending'
// (or unchanged), and CANCELLED/SUSPENDED keep only time already paid for
// ('renewing' until expires_at, the same meaning as a Stripe
// cancel-at-period-end). A subscription that has never had a confirmed
// payment has no row to update - the first payment links it.
async function handleSubscriptionLifecycle(config: PayPalConfig, event: PayPalWebhookEvent, log: DeliveryLog) {
  const subscriptionId = event.resource?.id;
  if (!subscriptionId) {
    throw new IgnoredEvent("subscription event has no resource id");
  }

  const { subscription, userId, cycle } = await fetchOwnedSubscription(config, subscriptionId);
  const row = await loadSubscriptionRow(userId);

  if (!row || row.payment_provider !== "paypal" || row.paypal_subscription_id !== subscription.id) {
    // Not linked yet (no confirmed payment) - nothing to change.
    log.outcome = "not_linked";
    log.detail = `PayPal status ${subscription.status}`;
    return;
  }

  const status = deriveAccessStatus(subscription.status, row.expires_at);
  // E.g. CANCELLED after a refund already revoked access: cancelled -> cancelled, no write.
  log.outcome = status && status !== row.status ? "status_updated" : "unchanged";
  log.detail = `PayPal status ${subscription.status}; access ${row.status} -> ${status && status !== row.status ? status : row.status}`;
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
      .eq("id", row.id)
      .abortSignal(dbDeadline());

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
    ).abortSignal(dbDeadline());

    if (error) throw error;
  }
}

// === PAYMENT.SALE.REFUNDED / REVERSED ===
// Policy and verification rules live in lib/paypalRefunds.ts (unit-tested);
// this only supplies the real Supabase and PayPal calls. A confirmed full
// refund or reversal revokes Premium and cancels the subscription; a
// partial refund keeps both; anything unconfirmed is recorded in
// paypal_refund_events as needs_review without touching access.
async function handleRefundOrReversal(config: PayPalConfig, event: PayPalWebhookEvent, log: DeliveryLog) {
  const deps: RefundDeps = {
    async findRecordedPayment(saleIds) {
      const { data, error } = await supabaseAdmin
        .from("payment_history")
        .select("subscription_id, transaction_reference, payment_status, payment_date")
        .eq("payment_provider", "paypal")
        .in("transaction_reference", saleIds)
        .limit(1)
        .abortSignal(dbDeadline());
      if (error) throw error;
      const row = data?.[0];
      return row
        ? {
            saleId: row.transaction_reference,
            subscriptionRowId: row.subscription_id,
            paymentStatus: row.payment_status,
            paymentDate: row.payment_date,
          }
        : null;
    },
    async loadSubscriptionRow(rowId) {
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status, payment_provider, paypal_subscription_id, expires_at, cancelled_at")
        .eq("id", rowId)
        .abortSignal(dbDeadline())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    listTransactions: (subscriptionId, start, end) => listSubscriptionTransactions(config, subscriptionId, start, end),
    getSubscriptionStatus: async (subscriptionId) => (await getSubscription(config, subscriptionId)).status,
    cancelSubscription: (subscriptionId, reason) => cancelSubscription(config, subscriptionId, reason),
    async setPaymentStatus(saleId, status, onlyFrom) {
      // Conditional: matches nothing if a concurrent delivery already wrote
      // an equal or higher status (e.g. 'reversed'), so it never moves back.
      const { error } = await supabaseAdmin
        .from("payment_history")
        .update({ payment_status: status })
        .eq("payment_provider", "paypal")
        .eq("transaction_reference", saleId)
        .in("payment_status", onlyFrom)
        .abortSignal(dbDeadline());
      if (error) throw error;
    },
    async revokeAccess(rowId, update) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", rowId)
        .abortSignal(dbDeadline());
      if (error) throw error;
    },
    async recordOutcome(record) {
      // One row per PayPal event id: a redelivery updates it in place.
      const { error } = await supabaseAdmin.from("paypal_refund_events").upsert(
        {
          paypal_event_id: record.eventId,
          event_type: record.eventType,
          sale_id: record.saleId,
          paypal_subscription_id: record.paypalSubscriptionId,
          subscription_id: record.subscriptionRowId,
          outcome: record.outcome,
          paypal_cancellation: record.paypalCancellation,
          review_reason: record.reviewReason,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "paypal_event_id" }
      ).abortSignal(dbDeadline());
      if (error) throw error;
    },
    now: () => new Date(),
  };

  const result = await processRefundEvent(deps, event);
  if (result.kind === "ignored") {
    throw new IgnoredEvent(result.reason);
  }

  const { record } = result;
  log.outcome = record.outcome;
  log.cancellation = record.paypalCancellation;
  log.needs_review = record.outcome === "needs_review" || record.paypalCancellation === "pending";
  log.detail =
    `sale ${record.saleId ?? "?"}, subscription ${record.paypalSubscriptionId ?? "?"}` +
    (record.reviewReason ? ` - ${record.reviewReason}` : "");

  if (result.retry) {
    throw new Error("refund/reversal not fully processed yet - PayPal will redeliver"); // 500 -> PayPal retries
  }
}
