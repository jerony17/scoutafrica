"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isPlayerReport } from "../../lib/types";
import type { PlayerReport } from "../../lib/types";

export default function PlayerReportsAdmin() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [updating, setUpdating] = useState(false);

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

    async function loadReports() {
      const { data, error } = await supabase
        .from("player_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      setReports(isArrayOf(data, isPlayerReport) ? data : []);
    }

    loadReports();
  }, [checkingAccess, reloadIndex]);

  async function updateReport(id: number, status: string) {
    setUpdating(true);

    const { error } = await supabase
      .from("player_reports")
      .update({ status })
      .eq("id", id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setReloadIndex((i) => i + 1);
  }

  function suspendPlayer(playerId: number | null) {
    // Placeholder, exactly as requested: ScoutAfrica has no account
    // suspension mechanism yet (no status column on player for this, and
    // building real suspension - blocking signin, hiding the profile,
    // etc. - is a separate feature). This intentionally does not pretend
    // to do something it can't.
    alert(
      `Suspend Player #${playerId ?? "?"} - not implemented yet. This is a placeholder, as requested; building real suspension is a separate feature.`
    );
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/admin" className="text-green-700 text-sm font-medium">
          ← Back to Admin Dashboard
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-8">
          Player Reports
        </h1>

        {reports.length === 0 && (
          <p className="text-gray-500">No reports to show.</p>
        )}

        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    Player #{report.player_id} · {report.reason}
                  </p>
                  <p className="text-sm text-gray-500">
                    {report.created_at ? new Date(report.created_at).toLocaleDateString() : ""}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    report.status === "reviewed"
                      ? "bg-green-100 text-green-800"
                      : report.status === "dismissed"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {report.status}
                </span>
              </div>

              {report.details && (
                <p className="text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">{report.details}</p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateReport(report.id, "reviewed")}
                  disabled={updating}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Mark as Reviewed
                </button>
                <button
                  onClick={() => updateReport(report.id, "dismissed")}
                  disabled={updating}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => suspendPlayer(report.player_id)}
                  className="bg-red-100 hover:bg-red-200 text-red-700 text-sm px-4 py-2 rounded-lg"
                >
                  Suspend Player
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
