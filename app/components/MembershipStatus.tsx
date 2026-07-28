"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isSubscription } from "../lib/types";
import type { Subscription } from "../lib/types";
import { getEffectiveSubscriptionStatus, PLAN_LABELS, type BillingCycle } from "../lib/pricing";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

const STATUS_BADGE: Record<string, string> = {
  premium: "bg-green-100 text-green-800",
  renewing: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-gray-200 text-gray-700",
  expired: "bg-red-100 text-red-700",
  past_due: "bg-red-100 text-red-700",
  free: "bg-gray-100 text-gray-500",
};

// Self-contained: fetches its own data, so it can be dropped into any
// page (the /membership page, a future account-settings page, etc.)
// without the caller needing to fetch and pass down a subscription prop.
export default function MembershipStatus() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && isSubscription(data)) {
        setSubscription(data);
      }

      setLoading(false);
    }

    load();
  }, []);

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

  if (loading) {
    return <div className="animate-pulse bg-gray-100 rounded-2xl h-40" />;
  }

  const effectiveStatus = getEffectiveSubscriptionStatus(subscription?.status, subscription?.expires_at);
  const isActive = effectiveStatus === "premium" || effectiveStatus === "renewing";
  const remaining = daysRemaining(subscription?.expires_at ?? null);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-500">Current Plan</p>
          <p className="text-2xl font-bold text-gray-900 tracking-tight">
            {effectiveStatus === "free" || !subscription?.billing_cycle
              ? "Free"
              : `Premium — ${PLAN_LABELS[subscription.billing_cycle as BillingCycle]}`}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_BADGE[effectiveStatus]}`}>
          {effectiveStatus === "premium" && "🟢 Premium"}
          {effectiveStatus === "renewing" && "🟢 Premium (cancelling at period end)"}
          {effectiveStatus === "pending" && "🟡 Pending"}
          {effectiveStatus === "cancelled" && "⚫ Cancelled"}
          {effectiveStatus === "expired" && "🔴 Expired"}
          {effectiveStatus === "past_due" && "🔴 Payment Past Due"}
          {effectiveStatus === "free" && "Free"}
        </span>
      </div>

      {subscription && effectiveStatus !== "free" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-6">
          <div>
            <p className="text-gray-400">Expiration Date</p>
            <p className="font-semibold text-gray-900 mt-0.5">{formatDate(subscription.expires_at)}</p>
          </div>
          <div>
            <p className="text-gray-400">Days Remaining</p>
            <p className="font-semibold text-gray-900 mt-0.5">
              {remaining === null ? "—" : `${remaining} day${remaining === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <a
          href="/membership"
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
        >
          {isActive ? "Renew" : "Upgrade to Premium"}
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
      </div>
    </div>
  );
}
