"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isSubscription } from "../lib/types";
import type { Subscription } from "../lib/types";
import { getEffectiveSubscriptionStatus, PLAN_LABELS, type BillingCycle } from "../lib/pricing";
import { detectCurrency } from "../lib/currency";

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
//
// The Upgrade/Renew button calls the SAME checkout-session API that
// /upgrade uses (app/api/stripe/create-checkout-session/route.ts) - it
// does not reimplement plan/currency selection here, since that would
// duplicate what /upgrade already does correctly. When this user already
// has a known billing_cycle/currency (renewing an existing or lapsed
// subscription), this is a genuine one-click "Renew" using those known
// values. For a brand-new subscriber with no existing plan on record,
// there's nothing to reuse, so the button sends them to /upgrade to
// actually choose one - that's the one case where selection is required.
export default function MembershipStatus() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser(); 
      console.log("Logged in user:", user?.id, user?.email);

      if (!user) {
        setLoading(false);
        return;
      }

   const { data, error } = await supabase
  .from("subscriptions")
  .select("*")
  .eq("user_id", user.id);

console.log("Logged in user:", user.id);
console.log("Subscription query result:", data);
console.log("Subscription query error:", error);

if (data && data.length > 0 && isSubscription(data[0])) {
  console.log("Loaded subscription:", data[0]);
  setSubscription(data[0]); 
  console.log("Subscription status:", data[0].status);
console.log("Subscription expires_at:", data[0].expires_at);
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

  async function handleUpgradeOrRenew() {
    // No known existing plan (a free user who has never subscribed) -
    // there's nothing to reuse, so send them to /upgrade to choose one.
    if (!subscription?.billing_cycle) {
      window.location.href = "/upgrade";
      return;
    }

    setStartingCheckout(true);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle: subscription.billing_cycle,
          currency: subscription.currency || detectCurrency(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.url) {
        throw new Error(data.error || "Failed to start checkout");
      }

      window.location.href = data.url;
    } catch (error) {
      setStartingCheckout(false);
      alert(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  }

  if (loading) {
    return <div className="animate-pulse bg-gray-100 rounded-2xl h-40" />;
  }

  const effectiveStatus = getEffectiveSubscriptionStatus(subscription?.status, subscription?.expires_at);
  const isActive = effectiveStatus === "premium" || effectiveStatus === "renewing";
  const remaining = daysRemaining(subscription?.expires_at ?? null);
console.log("Current subscription state:", subscription);
console.log("Effective status:", effectiveStatus);

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
        <button
          onClick={handleUpgradeOrRenew}
          disabled={startingCheckout}
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
        >
          {startingCheckout ? "Redirecting..." : isActive ? "Renew" : "Upgrade to Premium"}
        </button>
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
