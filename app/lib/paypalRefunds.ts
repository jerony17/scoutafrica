// PayPal refund / reversal (chargeback) decisions - no runtime imports, so
// every rule that can revoke Premium is unit-tested with fake dependencies
// (tests/paypalRefunds.test.mjs). The webhook (app/api/paypal/webhook/route.ts)
// supplies the real Supabase and PayPal calls.
//
// Business policy:
//   - Confirmed FULL refund      -> revoke Premium now + cancel the PayPal subscription.
//   - Confirmed reversal         -> revoke Premium now + cancel the PayPal subscription.
//   - PARTIAL refund             -> keep Premium, keep the subscription.
//   - Anything not confirmed     -> flagged for review, access untouched.
//
// SECURITY: the event has already passed PayPal signature verification, but
// its ids are still only used as lookup keys:
//   - the sale must be a payment we recorded ourselves (payment_history),
//   - the PayPal subscription comes from OUR subscriptions row, never from
//     the payload,
//   - full vs partial comes from PayPal's own transaction list for that
//     subscription (REFUNDED vs PARTIALLY_REFUNDED), never from amounts in
//     the payload.
import type { PayPalTransaction } from "./paypalBilling";

export type RefundEventType = "PAYMENT.SALE.REFUNDED" | "PAYMENT.SALE.REVERSED";

export interface RefundWebhookEvent {
  id?: string;
  event_type?: string;
  resource?: { id?: unknown; sale_id?: unknown };
}

export interface RecordedPayment {
  saleId: string;
  subscriptionRowId: number;
  paymentStatus: string;
  paymentDate: string | null;
}

export interface LinkedSubscriptionRow {
  id: number;
  status: string;
  payment_provider: string | null;
  paypal_subscription_id: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
}

export type RefundOutcome = "access_revoked" | "partial_refund_access_retained" | "needs_review";
export type PayPalCancellation = "not_required" | "confirmed" | "pending";
export type AdjustedPaymentStatus = "refunded" | "partially_refunded" | "reversed";

export interface RefundOutcomeRecord {
  eventId: string;
  eventType: RefundEventType;
  saleId: string | null;
  paypalSubscriptionId: string | null;
  subscriptionRowId: number | null;
  outcome: RefundOutcome;
  paypalCancellation: PayPalCancellation;
  reviewReason: string | null;
}

export interface RevocationUpdate {
  status: "cancelled";
  expires_at: string;
  cancelled_at: string;
}

export interface RefundDeps {
  findRecordedPayment(saleIds: string[]): Promise<RecordedPayment | null>;
  loadSubscriptionRow(rowId: number): Promise<LinkedSubscriptionRow | null>;
  listTransactions(subscriptionId: string, start: Date, end: Date): Promise<PayPalTransaction[]>;
  getSubscriptionStatus(subscriptionId: string): Promise<string>;
  cancelSubscription(subscriptionId: string, reason: string): Promise<void>;
  setPaymentStatus(saleId: string, status: AdjustedPaymentStatus): Promise<void>;
  revokeAccess(rowId: number, update: RevocationUpdate): Promise<void>;
  recordOutcome(record: RefundOutcomeRecord): Promise<void>;
  now(): Date;
}

// retry: true -> the webhook answers 500 so PayPal redelivers the event
// (verification could not finish, or PayPal has not confirmed the
// cancellation yet). Every step is idempotent, so a redelivery is safe.
export type RefundResult =
  | { kind: "ignored"; reason: string }
  | { kind: "done"; record: RefundOutcomeRecord; retry: boolean };

const TRANSACTION_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const CANCELLATION_REASON = "Payment refunded or reversed - ScoutAfrica Premium ended";

export function isRefundEventType(eventType: string | undefined): eventType is RefundEventType {
  return eventType === "PAYMENT.SALE.REFUNDED" || eventType === "PAYMENT.SALE.REVERSED";
}

// A refund resource names its sale in sale_id; a reversal's resource shape
// has not been observed in Sandbox, so both fields are offered. Only an id
// matching a payment we recorded is ever acted on.
export function saleIdCandidates(event: RefundWebhookEvent): string[] {
  const ids = [event.resource?.sale_id, event.resource?.id].filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  return [...new Set(ids)];
}

// PayPalApiError carries the HTTP status; duck-typed so this file has no
// runtime imports.
function hasStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === "object" && error !== null && "status" in error ? ` (HTTP ${String(error.status)})` : "";
  return `${message}${status}`;
}

// Premium ends now. Never extends an expiry that has already passed, and
// returns null when the row is already revoked (redelivery -> no write).
export function revocationUpdate(row: LinkedSubscriptionRow, now: Date): RevocationUpdate | null {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const expiryValid = expiresAt !== null && !Number.isNaN(expiresAt.getTime());
  const hasAccess = row.status === "premium" || row.status === "renewing";
  const timeLeft = !expiryValid || expiresAt.getTime() > now.getTime();

  if (!hasAccess && !timeLeft) return null;

  return {
    status: "cancelled",
    expires_at: expiryValid && !timeLeft ? expiresAt.toISOString() : now.toISOString(),
    cancelled_at: row.cancelled_at ?? now.toISOString(),
  };
}

// A reversal outranks a refund, and a full refund outranks a partial one:
// a later or redelivered event never downgrades the recorded status.
const STATUS_RANK: Record<string, number> = { success: 0, partially_refunded: 1, refunded: 2, reversed: 3 };

export function nextPaymentStatus(current: string, incoming: AdjustedPaymentStatus): AdjustedPaymentStatus | null {
  const currentRank = STATUS_RANK[current] ?? -1;
  return STATUS_RANK[incoming] > currentRank ? incoming : null;
}

// Cancels at PayPal and reports "confirmed" ONLY when PayPal itself then
// reports the subscription CANCELLED/EXPIRED. Checked first, so a
// redelivered event never sends a second cancel request.
async function ensureCancelled(deps: RefundDeps, subscriptionId: string): Promise<{ cancellation: PayPalCancellation; reason: string | null }> {
  const ended = (status: string) => status === "CANCELLED" || status === "EXPIRED";

  try {
    if (ended(await deps.getSubscriptionStatus(subscriptionId))) {
      return { cancellation: "confirmed", reason: null };
    }

    try {
      await deps.cancelSubscription(subscriptionId, CANCELLATION_REASON);
    } catch (error) {
      // 422 = not cancellable in its current state; re-read below decides.
      if (!hasStatus(error, 422)) throw error;
    }

    const after = await deps.getSubscriptionStatus(subscriptionId);
    if (ended(after)) return { cancellation: "confirmed", reason: null };
    return { cancellation: "pending", reason: `PayPal still reports subscription ${subscriptionId} as ${after} after cancel` };
  } catch (error) {
    return { cancellation: "pending", reason: `PayPal cancellation of ${subscriptionId} not confirmed: ${describeError(error)}` };
  }
}

export async function processRefundEvent(deps: RefundDeps, event: RefundWebhookEvent): Promise<RefundResult> {
  const eventType = event.event_type;
  if (!isRefundEventType(eventType)) return { kind: "ignored", reason: `not a refund/reversal event: ${eventType ?? "?"}` };
  if (!event.id) return { kind: "ignored", reason: "event has no id" };

  const base = {
    eventId: event.id,
    eventType,
    saleId: null as string | null,
    paypalSubscriptionId: null as string | null,
    subscriptionRowId: null as number | null,
  };

  const finish = async (
    fields: Partial<RefundOutcomeRecord> & Pick<RefundOutcomeRecord, "outcome" | "paypalCancellation" | "reviewReason">,
    retry = false
  ): Promise<RefundResult> => {
    const record: RefundOutcomeRecord = { ...base, ...fields };
    await deps.recordOutcome(record);
    return { kind: "done", record, retry };
  };

  const review = (reason: string, retry = false) =>
    finish({ outcome: "needs_review", paypalCancellation: "not_required", reviewReason: reason }, retry);

  const candidates = saleIdCandidates(event);
  if (candidates.length === 0) return review("event names no sale id");

  try {
    const payment = await deps.findRecordedPayment(candidates);
    if (!payment) {
      // E.g. a conflicting payment that was never applied and was refunded
      // manually - there is no ScoutAfrica access attached to revoke.
      return review(`sale ${candidates.join(" / ")} is not a recorded ScoutAfrica PayPal payment`);
    }
    base.saleId = payment.saleId;
    base.subscriptionRowId = payment.subscriptionRowId;

    const row = await deps.loadSubscriptionRow(payment.subscriptionRowId);
    if (!row || row.payment_provider !== "paypal" || !row.paypal_subscription_id) {
      return review(`subscription row ${payment.subscriptionRowId} is no longer linked to PayPal`);
    }
    base.paypalSubscriptionId = row.paypal_subscription_id;

    const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null;
    if (!paidAt || Number.isNaN(paidAt.getTime())) {
      return review(`recorded payment ${payment.saleId} has no valid payment date`);
    }

    const transactions = await deps.listTransactions(
      row.paypal_subscription_id,
      new Date(paidAt.getTime() - TRANSACTION_WINDOW_MS),
      new Date(paidAt.getTime() + TRANSACTION_WINDOW_MS)
    );
    const transaction = transactions.find((t) => t.id === payment.saleId);
    if (!transaction) {
      // The sale belongs to an earlier subscription (not the linked one), so
      // revoking the current membership is not confirmed safe.
      return review(`sale ${payment.saleId} not found on linked PayPal subscription ${row.paypal_subscription_id}`);
    }

    let adjusted: AdjustedPaymentStatus;
    if (eventType === "PAYMENT.SALE.REVERSED") {
      adjusted = "reversed";
    } else if (transaction.status === "REFUNDED") {
      adjusted = "refunded";
    } else if (transaction.status === "PARTIALLY_REFUNDED") {
      adjusted = "partially_refunded";
    } else {
      // PayPal hasn't (yet) reflected the refund - never guess full vs partial.
      return review(`PayPal reports sale ${payment.saleId} as ${transaction.status ?? "missing"}, not refunded`, true);
    }

    const newStatus = nextPaymentStatus(payment.paymentStatus, adjusted);
    if (newStatus) await deps.setPaymentStatus(payment.saleId, newStatus);

    if (adjusted === "partially_refunded") {
      return finish({ outcome: "partial_refund_access_retained", paypalCancellation: "not_required", reviewReason: null });
    }

    // Revoke first: access ends even if PayPal can't be reached right now.
    const update = revocationUpdate(row, deps.now());
    if (update) await deps.revokeAccess(row.id, update);

    const { cancellation, reason } = await ensureCancelled(deps, row.paypal_subscription_id);
    return finish({ outcome: "access_revoked", paypalCancellation: cancellation, reviewReason: reason }, cancellation === "pending");
  } catch (error) {
    // Verification/storage failed part-way: flag it and let PayPal redeliver.
    // Nothing above revokes access before the refund is confirmed.
    try {
      return await review(`processing failed: ${describeError(error)}`, true);
    } catch {
      throw error;
    }
  }
}
