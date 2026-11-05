// Pure PayPal billing decisions - no imports, no I/O, so every rule that
// decides whether someone gets Premium can be unit-tested in isolation.
// The webhook (app/api/paypal/webhook/route.ts) does all the fetching and
// writing; it asks this file what the fetched facts mean.

export type PayPalBillingCycle = "monthly" | "annual";

// Statuses PayPal reports for a subscription (Subscriptions API v1).
export type PayPalSubscriptionStatus =
  | "APPROVAL_PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

// Only statuses migration 028's CHECK constraint is known to allow -
// 'past_due' is written by the Stripe webhook but is NOT in any repo
// migration, so PayPal code deliberately avoids it until the live
// constraint has been verified.
export type AccessStatus = "pending" | "premium" | "renewing" | "cancelled" | "expired";

export interface PayPalTransaction {
  id: string;
  status?: string;
  time: string;
  amount_with_breakdown?: { gross_amount?: { currency_code?: string; value?: string } };
}

// A renewal is charged on the billing date, but the webhook confirming it
// can arrive later (and PayPal retries failed charges for some days). This
// keeps a paying subscriber from flickering out of Premium in that gap.
// It only ever extends time that a verified payment already started.
export const RENEWAL_GRACE_DAYS = 3;

export function amountsMatch(value: string | undefined, expected: number): boolean {
  if (value === undefined) return false;
  const paid = Number(value);
  if (!Number.isFinite(paid)) return false;
  return Math.round(paid * 100) === Math.round(expected * 100);
}

// Premium time bought by ONE verified payment: payment time + one billing
// period + grace. Deliberately NOT PayPal's next_billing_time - that is a
// schedule, not proof that anything was paid.
export function paidUntil(paymentTimeIso: string, cycle: PayPalBillingCycle, graceDays = RENEWAL_GRACE_DAYS): Date {
  const paid = new Date(paymentTimeIso);
  if (Number.isNaN(paid.getTime())) {
    throw new Error(`Invalid payment time: ${paymentTimeIso}`);
  }
  const end = new Date(paid.getTime());
  const dayOfMonth = end.getUTCDate();
  if (cycle === "monthly") {
    end.setUTCMonth(end.getUTCMonth() + 1);
  } else {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  }
  // Jan 31 + 1 month would roll over into March (and Feb 29 + 1 year into
  // March); clamp to the last day of the intended month instead.
  if (end.getUTCDate() !== dayOfMonth) {
    end.setUTCDate(0);
  }
  end.setUTCDate(end.getUTCDate() + graceDays);
  return end;
}

// Never shortens access: a duplicate or out-of-order (older) payment event
// can't pull an expiry backwards.
export function laterExpiry(existingIso: string | null | undefined, candidate: Date): Date {
  if (!existingIso) return candidate;
  const existing = new Date(existingIso);
  if (Number.isNaN(existing.getTime())) return candidate;
  return existing.getTime() > candidate.getTime() ? existing : candidate;
}

// Maps PayPal's subscription state + the expiry earned by verified
// payments onto ScoutAfrica's existing statuses (what is_user_premium()
// reads). Crucially, 'premium' is only ever returned together with a
// future expiry: is_user_premium() treats a NULL expires_at as "never
// expires", so an ACTIVE-but-unpaid subscription must stay 'pending'.
// Returns null for states that should not change anything yet.
export function deriveAccessStatus(
  paypalStatus: string,
  expiresAtIso: string | null | undefined,
  now: Date = new Date()
): AccessStatus | null {
  const expiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
  const paidTimeLeft = expiresAt !== null && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime();

  switch (paypalStatus) {
    case "ACTIVE":
      return paidTimeLeft ? "premium" : "pending";
    case "SUSPENDED":
    case "CANCELLED":
      // No further renewals, but time already paid for is honoured
      // ('renewing' = still Premium, will not renew - same meaning the
      // Stripe cancel flow already uses).
      return paidTimeLeft ? "renewing" : "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      // APPROVAL_PENDING / APPROVED: approved is not paid.
      return null;
  }
}

// retryable: the payment may simply not be visible/settled yet (not
// listed, or still PENDING) - worth PayPal redelivering the event later.
// Not retryable: it is visibly wrong (declined, refunded, wrong amount or
// currency) and must never grant Premium, however often it is redelivered.
export type PaymentCheck =
  | { ok: true; transaction: PayPalTransaction }
  | { ok: false; retryable: boolean; reason: string };

// Confirms a specific payment against PayPal's own transaction list for
// the subscription: same id, COMPLETED, exact expected amount and
// currency. Anything else is not a confirmed payment.
export function findConfirmedPayment(
  transactions: PayPalTransaction[],
  transactionId: string,
  expected: { currency: string; amount: number }
): PaymentCheck {
  const match = transactions.find((t) => t.id === transactionId);
  if (!match) {
    return { ok: false, retryable: true, reason: `transaction ${transactionId} not found on subscription` };
  }
  if (match.status === "PENDING") {
    return { ok: false, retryable: true, reason: `transaction ${transactionId} is still PENDING` };
  }
  if (match.status !== "COMPLETED") {
    return { ok: false, retryable: false, reason: `transaction ${transactionId} status is ${match.status ?? "missing"}` };
  }
  const gross = match.amount_with_breakdown?.gross_amount;
  if (gross?.currency_code !== expected.currency) {
    return { ok: false, retryable: false, reason: `currency ${gross?.currency_code ?? "missing"} != ${expected.currency}` };
  }
  if (!amountsMatch(gross.value, expected.amount)) {
    return { ok: false, retryable: false, reason: `amount ${gross.value ?? "missing"} != ${expected.amount}` };
  }
  return { ok: true, transaction: match };
}

export interface ExistingSubscriptionRow {
  payment_provider?: string | null;
  paypal_subscription_id?: string | null;
  status?: string | null;
  expires_at?: string | null;
}

// Why a PayPal subscription must NOT be linked to this user's row:
// - "other_provider": a Stripe/Paystack (or manually granted) subscription
//   is still live - paid time left, or a failed renewal the provider is
//   still retrying (past_due). Taking the row over would leave that
//   provider billing, and its later webhooks would overwrite the PayPal
//   record.
// - "other_paypal_subscription": a different PayPal subscription is already
//   linked and paid up (e.g. the user approved checkout twice). Replacing
//   it would orphan the first one, which would keep billing.
// null = no conflict (no row, the same subscription, or nothing live).
export type SubscriptionConflict = "other_provider" | "other_paypal_subscription";

export function conflictingSubscription(
  row: ExistingSubscriptionRow | null | undefined,
  paypalSubscriptionId: string | null,
  now: Date = new Date()
): SubscriptionConflict | null {
  if (!row) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  // Same rule as is_user_premium(): a NULL expiry never expires.
  const paidTimeLeft =
    (row.status === "premium" || row.status === "renewing") &&
    (expiresAt === null || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > now.getTime());

  if (row.payment_provider !== "paypal") {
    return paidTimeLeft || row.status === "past_due" ? "other_provider" : null;
  }
  if (paypalSubscriptionId && row.paypal_subscription_id && row.paypal_subscription_id !== paypalSubscriptionId) {
    return paidTimeLeft ? "other_paypal_subscription" : null;
  }
  return null;
}

const UUID_RE =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
