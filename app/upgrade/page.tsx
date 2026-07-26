"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { detectCurrency } from "../lib/currency";
import {
  PRICE_POINTS,
  type BillingCycle,
  type SupportedCurrency,
} from "../lib/pricing";

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: "JPY", label: "🇯🇵 JPY" },
  { value: "NGN", label: "🇳🇬 NGN" },
  { value: "USD", label: "🇺🇸 USD" },
  { value: "GBP", label: "🇬🇧 GBP" },
  { value: "EUR", label: "🇪🇺 EUR" },
];

// Every payment method below routes through ONE of two endpoints -
// card/Apple Pay/Google Pay all go through Stripe Checkout (which
// surfaces wallets automatically when the browser/device supports them),
// Paystack has its own. This is the genuine unified experience the spec
// asks for: the user picks a method they recognize, the routing behind
// it is an implementation detail they never see.
const PAYMENT_METHODS: { id: string; label: string; provider: "stripe" | "paystack" }[] = [
  { id: "card", label: "💳 Visa / Mastercard / American Express", provider: "stripe" },
  { id: "apple_pay", label: "🍎 Apple Pay", provider: "stripe" },
  { id: "google_pay", label: "🤖 Google Pay", provider: "stripe" },
  { id: "paystack", label: "🟢 Paystack", provider: "paystack" },
];

function formatPrice(amount: number, currency: SupportedCurrency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function UpgradePage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [currency, setCurrency] = useState<SupportedCurrency>("JPY");
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      setCurrency(detectCurrency());
      setCheckingAccess(false);
    }

    init();
  }, [router]);

  async function handlePaymentMethodSelect(methodId: string, provider: "stripe" | "paystack") {
    setProcessing(methodId);

    try {
      const endpoint =
        provider === "stripe"
          ? "/api/stripe/create-checkout-session"
          : "/api/paystack/initialize";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle, currency }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Failed to start checkout");
      }

      window.location.href = data.url;
    } catch (error) {
      setProcessing(null);
      alert(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const price = PRICE_POINTS[currency];

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="text-center mb-8">
          <p className="text-green-700 text-xs font-semibold tracking-[0.2em] uppercase mb-2">
            ScoutAfrica Premium
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Upgrade to Premium</h1>
          <p className="text-gray-500 mt-2">
            Unlimited watchlist, priority search ranking, and a Premium badge on your profile.
          </p>
        </div>

        {/* Billing cycle */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex gap-2 mb-6">
          <button
            onClick={() => setCycle("monthly")}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
              cycle === "monthly" ? "bg-green-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Monthly
            <span className="block text-xs font-normal mt-0.5 opacity-80">
              {formatPrice(price.monthly, currency)}/mo
            </span>
          </button>
          <button
            onClick={() => setCycle("annual")}
            className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
              cycle === "annual" ? "bg-green-600 text-white shadow-md" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Annual
            <span className="block text-xs font-normal mt-0.5 opacity-80">
              {formatPrice(price.annual, currency)}/yr
            </span>
          </button>
        </div>

        {/* Currency */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Display Currency
          </label>
          <div className="flex flex-wrap gap-2">
            {CURRENCY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setCurrency(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  currency === option.value
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Detected automatically from your browser - change it anytime.
          </p>
        </div>

        {/* Payment methods */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-bold text-lg mb-1">Choose Payment Method</h2>
          <p className="text-gray-500 text-sm mb-4">
            {formatPrice(cycle === "monthly" ? price.monthly : price.annual, currency)}
            {cycle === "monthly" ? " / month" : " / year"}
          </p>

          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                onClick={() => handlePaymentMethodSelect(method.id, method.provider)}
                disabled={processing !== null}
                className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-3.5 text-left font-medium text-gray-800 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
              >
                <span>{method.label}</span>
                <span className="text-gray-400">
                  {processing === method.id ? "Redirecting..." : "→"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          You&apos;ll be redirected to a secure payment page. ScoutAfrica never stores your card details.
        </p>
      </div>
    </main>
  );
}
