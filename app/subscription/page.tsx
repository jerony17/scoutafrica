"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { isArrayOf, isPaymentHistoryEntry, isSubscription } from "../lib/types";
import type { PaymentHistoryEntry, Subscription } from "../lib/types";
import { getEffectiveSubscriptionStatus, PLAN_LABELS, type BillingCycle } from "../lib/pricing";

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  premium: "bg-green-100 text-green-800",
  renewing: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-200 text-gray-700",
  expired: "bg-red-100 text-red-700",
  free: "bg-gray-100 text-gray-500",
};

export default function SubscriptionDashboard() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      setCheckingAccess(false);
      await loadSubscription(user.id);
    }

    async function loadSubscription(userId: string) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (subData && isSubscription(subData)) {
        setSubscription(subData);

        const { data: historyData } = await supabase
          .from("payment_history")
          .select("*")
          .eq("subscription_id", subData.id)
          .order("payment_date", { ascending: false });

        setHistory(isArrayOf(historyData, isPaymentHistoryEntry) ? historyData : []);
      }

      setLoading(false);
    }

    init();
  }, [router]);

  async function handleCancel() {
    if (!confirm("Cancel your Premium subscription? You'll keep access until the current period ends.")) {
      return;
    }

    setCancelling(true);

    try {
      const response = await fetch("/api/subscription/cancel", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      alert("Your subscription has been set to cancel. You'll keep Premium access until it expires.");
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setCancelling(false);
    }
  }

  if (checkingAccess || loading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-3xl mx-auto animate-pulse space-y-6">
          <div className="h-40 bg-gray-200 rounded-2xl" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
        </div>
      </main>
    );
  }

  const effectiveStatus = getEffectiveSubscriptionStatus(
    subscription?.status,
    subscription?.expires_at
  );
  const isActive = effectiveStatus === "premium" || effectiveStatus === "renewing";

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">Subscription</h1>

        {!subscription || effectiveStatus === "free" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">⭐</p>
            <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;re on the Free plan</h2>
            <p className="text-gray-500 mb-6">
              Upgrade to Premium for unlimited watchlist, priority search ranking, and a Premium badge.
            </p>
            <a
              href="/upgrade"
              className="inline-block bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              Upgrade to Premium
            </a>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                  <p className="text-sm text-gray-500">Current Plan</p>
                  <p className="text-2xl font-bold text-gray-900 tracking-tight">
                    {subscription.plan ? PLAN_LABELS[subscription.billing_cycle as BillingCycle] : "—"}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_BADGE[effectiveStatus]}`}>
                  {effectiveStatus === "premium" && "🟢 Premium"}
                  {effectiveStatus === "renewing" && "🟢 Premium (cancelling at period end)"}
                  {effectiveStatus === "pending" && "🟡 Pending"}
                  {effectiveStatus === "cancelled" && "⚫ Cancelled"}
                  {effectiveStatus === "expired" && "🔴 Expired"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Amount</p>
                  <p className="font-semibold text-gray-900 mt-0.5">
                    {formatMoney(subscription.amount, subscription.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Billing</p>
                  <p className="font-semibold text-gray-900 mt-0.5 capitalize">
                    {subscription.billing_cycle || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Payment Method</p>
                  <p className="font-semibold text-gray-900 mt-0.5 capitalize">
                    {subscription.payment_method || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Provider</p>
                  <p className="font-semibold text-gray-900 mt-0.5 capitalize">
                    {subscription.payment_provider || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Started</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{formatDate(subscription.started_at)}</p>
                </div>
                <div>
                  <p className="text-gray-400">{isActive ? "Renews" : "Expired"}</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{formatDate(subscription.expires_at)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-gray-100">
                <a
                  href="/upgrade"
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                >
                  {isActive ? "Change Plan" : "Renew Premium"}
                </a>
                {isActive && effectiveStatus !== "renewing" && (
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="bg-white border border-gray-200 hover:border-red-300 hover:text-red-600 text-gray-600 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Subscription"}
                  </button>
                )}
                <button
                  disabled
                  title="Coming soon"
                  className="bg-gray-50 text-gray-400 text-sm font-semibold px-5 py-2.5 rounded-xl cursor-not-allowed"
                >
                  Download Invoice
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
              <h2 className="font-bold text-lg mb-4">Payment History</h2>

              {history.length === 0 ? (
                <p className="text-gray-500 text-sm">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatMoney(entry.amount, entry.currency)}
                        </p>
                        <p className="text-xs text-gray-400 capitalize">
                          {entry.payment_provider} · {entry.payment_method || "—"} · {formatDate(entry.payment_date)}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          entry.payment_status === "success"
                            ? "bg-green-100 text-green-800"
                            : entry.payment_status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {entry.payment_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
