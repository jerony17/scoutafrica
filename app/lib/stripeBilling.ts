// Pure Stripe billing decisions - no imports, no I/O, so the rules that
// decide whether someone gets Premium can be unit-tested in isolation
// (tests/stripeBilling.test.mjs). The webhook (app/api/stripe/webhook/
// route.ts) does all the fetching and writing; it asks this file what the
// fetched facts mean.

// ScoutAfrica statuses the Stripe webhook may write (all allowed by the
// Production subscriptions_status_check constraint).
export type StripeAccessStatus = "premium" | "renewing" | "past_due" | "cancelled";

// Maps a Stripe subscription status onto a ScoutAfrica status. Only an
// explicitly known status changes anything:
//   active / trialing                   -> premium (renewing if it is set to
//                                          cancel at period end)
//   past_due                            -> past_due (not Premium)
//   canceled / unpaid / incomplete_expired -> cancelled
// Anything else (incomplete, paused, or a status Stripe adds later)
// returns null: the existing record is left exactly as it is.
export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
  cancelAtPeriodEnd: boolean | null | undefined
): StripeAccessStatus | null {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return cancelAtPeriodEnd ? "renewing" : "premium";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "cancelled";
    default:
      return null;
  }
}

// Stripe does not deliver events in order, so a customer.subscription.updated
// snapshot taken before a cancellation can arrive after the
// customer.subscription.deleted event. A cancelled Stripe subscription never
// becomes active again (a new purchase creates a new subscription id, linked
// by checkout.session.completed), so once the row for this subscription is
// cancelled, an update event may only keep it cancelled.
export function shouldApplySubscriptionUpdate(
  currentStatus: string | null | undefined,
  nextStatus: StripeAccessStatus
): boolean {
  if (currentStatus === "cancelled" && nextStatus !== "cancelled") {
    return false;
  }
  return true;
}

// checkout.session.completed only grants Premium once Stripe reports the
// session as paid. Card, Apple Pay and Google Pay are always paid by then;
// 'unpaid' (a delayed payment method) or 'no_payment_required' grants nothing.
export function isCheckoutSessionPaid(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "paid";
}
