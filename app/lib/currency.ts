import type { SupportedCurrency } from "./pricing";

// Best-effort currency detection from the browser's locale via the Intl
// API - this is a real, working heuristic, not a placeholder, but it is
// NOT the same as IP-based geolocation or Stripe's Adaptive Pricing.
// A user on a UK VPN with a US-locale browser will see USD, not GBP -
// that's an inherent limitation of locale-based detection, not a bug.
// The /upgrade page always lets the user override this manually.
const LOCALE_CURRENCY_MAP: Record<string, SupportedCurrency> = {
  JP: "JPY",
  NG: "NGN",
  US: "USD",
  GB: "GBP",
  IE: "EUR",
  FR: "EUR",
  DE: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  PT: "EUR",
};

export function detectCurrency(): SupportedCurrency {
  if (typeof navigator === "undefined") return "JPY";

  try {
    const locale = navigator.language || "en-US";
    const region = new Intl.Locale(locale).region;
    if (region && region in LOCALE_CURRENCY_MAP) {
      return LOCALE_CURRENCY_MAP[region];
    }
  } catch {
    // Intl.Locale not supported or locale string unparsable - fall through.
  }

  return "JPY";
}
