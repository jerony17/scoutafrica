"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { isArrayOf, isPaymentHistoryEntry } from "../lib/types";
import type { PaymentHistoryEntry } from "../lib/types";
import MembershipStatus from "../components/MembershipStatus";

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

// This is the official ScoutAfrica Premium page. It shows the reusable
// MembershipStatus component (Phase 6) for the current-plan summary, plus
// this page's own payment history section - the two are kept separate
// since payment history is specific to this page, not something every
// caller of MembershipStatus needs.
export default function MembershipPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
      await loadHistory(user.id);
    }

    async function loadHistory(userId: string) {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (subData && typeof subData === "object" && "id" in subData) {
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

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">Membership</h1>

        <MembershipStatus />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mt-6">
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
      </div>
    </main>
  );
}
