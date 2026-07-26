"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isPaymentHistoryEntry } from "../../lib/types";
import type { PaymentHistoryEntry } from "../../lib/types";

interface AdminStats {
  total_premium_members: number;
  monthly_subscribers: number;
  annual_subscribers: number;
  monthly_revenue: number;
  annual_revenue: number;
  total_revenue: number;
  cancelled_count: number;
  expired_count: number;
  failed_payments: number;
}

interface CurrencyBreakdown {
  currency: string;
  total: number;
}

interface ProviderBreakdown {
  payment_provider: string;
  total: number;
}

interface MethodBreakdown {
  payment_method: string;
  usage_count: number;
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [byCurrency, setByCurrency] = useState<CurrencyBreakdown[]>([]);
  const [byProvider, setByProvider] = useState<ProviderBreakdown[]>([]);
  const [byMethod, setByMethod] = useState<MethodBreakdown[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      if (user.app_metadata?.is_admin !== true) {
        router.replace("/");
        return;
      }

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  useEffect(() => {
    if (checkingAccess) return;

    async function loadStats() {
      const [statsResult, currencyResult, providerResult, methodResult, paymentsResult] =
        await Promise.all([
          supabase.rpc("get_subscription_admin_stats"),
          supabase.rpc("get_revenue_by_currency"),
          supabase.rpc("get_revenue_by_provider"),
          supabase.rpc("get_payment_method_stats"),
          supabase
            .from("payment_history")
            .select("*")
            .order("payment_date", { ascending: false })
            .limit(15),
        ]);

      if (Array.isArray(statsResult.data) && statsResult.data.length > 0) {
        setStats(statsResult.data[0]);
      }
      if (Array.isArray(currencyResult.data)) setByCurrency(currencyResult.data);
      if (Array.isArray(providerResult.data)) setByProvider(providerResult.data);
      if (Array.isArray(methodResult.data)) setByMethod(methodResult.data);
      if (isArrayOf(paymentsResult.data, isPaymentHistoryEntry)) {
        setRecentPayments(paymentsResult.data);
      }

      setLoading(false);
    }

    loadStats();
  }, [checkingAccess]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const summaryCards: { label: string; value: number | string }[] = stats
    ? [
        { label: "Total Premium Members", value: stats.total_premium_members },
        { label: "Monthly Subscribers", value: stats.monthly_subscribers },
        { label: "Annual Subscribers", value: stats.annual_subscribers },
        { label: "Monthly Revenue", value: formatMoney(stats.monthly_revenue) },
        { label: "Annual Revenue", value: formatMoney(stats.annual_revenue) },
        { label: "Total Revenue", value: formatMoney(stats.total_revenue) },
        { label: "Cancelled Subscriptions", value: stats.cancelled_count },
        { label: "Expired Subscriptions", value: stats.expired_count },
        { label: "Failed Payments", value: stats.failed_payments },
      ]
    : [];

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin" className="text-green-700 text-sm font-medium">
          ← Back to Admin Dashboard
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-8">
          Subscription Management
        </h1>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {loading
            ? Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-24 bg-white rounded-2xl shadow-sm animate-pulse" />
              ))
            : summaryCards.map((card) => (
                <div key={card.label} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 tracking-tight">{card.value}</p>
                </div>
              ))}
        </div>

        <div className="grid md:grid-cols-3 gap-5 mb-10">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="font-bold mb-3">Revenue by Currency</h2>
            {byCurrency.length === 0 ? (
              <p className="text-gray-400 text-sm">No revenue yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {byCurrency.map((row) => (
                  <li key={row.currency} className="flex justify-between">
                    <span className="text-gray-500">{row.currency}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(row.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="font-bold mb-3">Revenue by Provider</h2>
            {byProvider.length === 0 ? (
              <p className="text-gray-400 text-sm">No revenue yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {byProvider.map((row) => (
                  <li key={row.payment_provider} className="flex justify-between capitalize">
                    <span className="text-gray-500">{row.payment_provider}</span>
                    <span className="font-semibold text-gray-900">{formatMoney(row.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h2 className="font-bold mb-3">Payment Method Stats</h2>
            {byMethod.length === 0 ? (
              <p className="text-gray-400 text-sm">No payments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {byMethod.map((row) => (
                  <li key={row.payment_method} className="flex justify-between capitalize">
                    <span className="text-gray-500">{row.payment_method}</span>
                    <span className="font-semibold text-gray-900">{row.usage_count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
          <h2 className="font-bold text-lg mb-4">Recent Payments</h2>

          {recentPayments.length === 0 ? (
            <p className="text-gray-500 text-sm">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="p-3">Amount</th>
                    <th className="p-3">Provider</th>
                    <th className="p-3">Method</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-50">
                      <td className="p-3 font-medium text-gray-900">
                        {payment.amount} {payment.currency}
                      </td>
                      <td className="p-3 capitalize">{payment.payment_provider}</td>
                      <td className="p-3 capitalize">{payment.payment_method || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            payment.payment_status === "success"
                              ? "bg-green-100 text-green-800"
                              : payment.payment_status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {payment.payment_status}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500">
                        {payment.payment_date ? new Date(payment.payment_date).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
