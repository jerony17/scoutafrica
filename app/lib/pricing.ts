// Single source of truth for plan pricing across the whole subscription
// system - the checkout API routes and the /upgrade UI both import this,
// rather than each hardcoding amounts separately.
//
// IMPORTANT, please read before going live: these are FIXED price points
// per currency, not live foreign-exchange conversion. True "automatic"
// currency detection/conversion (e.g. Stripe's Adaptive Pricing) requires
// account-level configuration in the Stripe Dashboard that only you can
// do (see PAYMENT_SETUP.md). This file's currency map is the fallback/
// baseline used by both providers and by the client-side currency
// detector in lib/currency.ts.

export type BillingCycle = "monthly" | "annual";
export type SupportedCurrency = "JPY" | "NGN" | "USD" | "GBP" | "EUR";

export interface PricePoint {
  currency: SupportedCurrency;
  monthly: number;
  annual: number;
}

// Base plan, in Japanese Yen - ScoutAfrica's home-market pricing.
export const BASE_CURRENCY: SupportedCurrency = "JPY";
export const BASE_PRICE_MONTHLY = 3000;
export const BASE_PRICE_ANNUAL = 25000;

// Fixed price points per currency. These are illustrative, reasonable
// approximations - YOU must review and adjust these to real, current
// figures before launch. Do not rely on them being FX-accurate.
export const PRICE_POINTS: Record<SupportedCurrency, PricePoint> = {
  JPY: { currency: "JPY", monthly: 3000, annual: 25000 },
  USD: { currency: "USD", monthly: 20, annual: 170 },
  GBP: { currency: "GBP", monthly: 16, annual: 135 },
  EUR: { currency: "EUR", monthly: 18, annual: 155 },
  NGN: { currency: "NGN", monthly: 4500, annual: 38000 },
};

export function getPricePoint(currency: SupportedCurrency): PricePoint {
  return PRICE_POINTS[currency] || PRICE_POINTS[BASE_CURRENCY];
}

export function getAmountForCycle(currency: SupportedCurrency, cycle: BillingCycle): number {
  const point = getPricePoint(currency);
  return cycle === "monthly" ? point.monthly : point.annual;
}

// Stripe requires amounts in the currency's smallest unit (cents, kobo,
// etc.) - JPY has no minor unit, everything else here does (x100).
const ZERO_DECIMAL_CURRENCIES: SupportedCurrency[] = ["JPY"];

export function toStripeAmount(amount: number, currency: SupportedCurrency): number {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? amount : Math.round(amount * 100);
}

// Paystack's API always expects the amount in the smallest unit too
// (kobo for NGN). Paystack only settles in a small set of currencies
// (NGN, GHS, ZAR, KES, USD as of this writing) - route non-NGN Paystack
// attempts to USD as a safe default; verify your Paystack account's
// enabled currencies before launch.
export function toPaystackAmount(amount: number, currency: SupportedCurrency): number {
  return ZERO_DECIMAL_CURRENCIES.includes(currency) ? amount : Math.round(amount * 100);
}

export const PLAN_LABELS: Record<BillingCycle, string> = {
  monthly: "Premium Monthly",
  annual: "Premium Annual",
};

// No scheduled sweep marks a lapsed subscription 'expired' (same decision
// made for the verification system - see migration 027's history: pg_cron
// was deliberately not used for the MVP). Automatic renewals themselves
// don't need a sweep - Stripe/Paystack push renewal webhooks proactively.
// This only covers the edge case of a subscription lapsing with no
// renewal and no cancellation ever recorded - computed at display time
// instead of relying on a background job to have already flipped the
// stored status.
export type SubscriptionStatus = "free" | "premium" | "pending" | "cancelled" | "expired" | "renewing" | "past_due";

export function getEffectiveSubscriptionStatus(
  status: SubscriptionStatus | null | undefined,
  expiresAt: string | null | undefined
): SubscriptionStatus {
  if (
    (status === "premium" || status === "renewing") &&
    expiresAt &&
    new Date(expiresAt).getTime() <= Date.now()
  ) {
    return "expired";
  }
  return status || "free";
}
