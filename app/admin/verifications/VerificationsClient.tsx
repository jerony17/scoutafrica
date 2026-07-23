"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isAccountVerification, isArrayOf, isPlayer } from "../../lib/types";
import type { AccountVerification, Player } from "../../lib/types";

type Tab = "player" | "club" | "scout";

export default function VerificationsClient({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [tab, setTab] = useState<Tab>(
    params.type === "club" || params.type === "scout" ? params.type : "player"
  );

  const [pendingPlayers, setPendingPlayers] = useState<Player[]>([]);
  const [verifiedPlayers, setVerifiedPlayers] = useState<Player[]>([]);
  const [clubVerifications, setClubVerifications] = useState<AccountVerification[]>([]);
  const [scoutVerifications, setScoutVerifications] = useState<AccountVerification[]>([]);
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

    async function loadData() {
      const [pending, verified, clubs, scouts] = await Promise.all([
        supabase.from("player").select("*").or("verified.is.null,verified.eq.false"),
        supabase.from("player").select("*").eq("verified", true),
        supabase.from("account_verifications").select("*").eq("account_type", "club").order("created_at", { ascending: false }),
        supabase.from("account_verifications").select("*").eq("account_type", "scout").order("created_at", { ascending: false }),
      ]);

      setPendingPlayers(isArrayOf(pending.data, isPlayer) ? pending.data : []);
      setVerifiedPlayers(isArrayOf(verified.data, isPlayer) ? verified.data : []);
      setClubVerifications(isArrayOf(clubs.data, isAccountVerification) ? clubs.data : []);
      setScoutVerifications(isArrayOf(scouts.data, isAccountVerification) ? scouts.data : []);
    }

    loadData();
  }, [checkingAccess, reloadIndex]);

  async function setPlayerVerified(playerId: number, verified: boolean) {
    setUpdating(true);
    const { error } = await supabase.from("player").update({ verified }).eq("id", playerId);
    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setReloadIndex((i) => i + 1);
  }

  async function setAccountStatus(id: number, status: "verified" | "rejected") {
    setUpdating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("account_verifications")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setReloadIndex((i) => i + 1);
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

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-6">
          Verifications
        </h1>

        <div className="flex gap-2 mb-8">
          {(["player", "club", "scout"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 rounded-xl font-semibold capitalize ${
                tab === t ? "bg-green-600 text-white" : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              {t}s
            </button>
          ))}
        </div>

        {tab === "player" && (
          <div className="space-y-8">
            <section>
              <h2 className="text-xl font-bold mb-3">Pending Player Verifications</h2>
              {pendingPlayers.length === 0 ? (
                <p className="text-gray-500">No players awaiting verification.</p>
              ) : (
                <div className="space-y-3">
                  {pendingPlayers.map((player) => (
                    <div key={player.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{player.full_name || "Unnamed Player"}</p>
                        <p className="text-sm text-gray-500">{player.scoutafrica_id || "No ID"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPlayerVerified(player.id, true)}
                          disabled={updating}
                          className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setPlayerVerified(player.id, false)}
                          disabled={updating}
                          className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-bold mb-3">Verified Players</h2>
              {verifiedPlayers.length === 0 ? (
                <p className="text-gray-500">No verified players yet.</p>
              ) : (
                <div className="space-y-3">
                  {verifiedPlayers.map((player) => (
                    <div key={player.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{player.full_name || "Unnamed Player"}</p>
                        <p className="text-sm text-gray-500">{player.scoutafrica_id || "No ID"}</p>
                      </div>
                      <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                        ✓ Verified
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {(tab === "club" || tab === "scout") && (
          <div className="space-y-3">
            {(tab === "club" ? clubVerifications : scoutVerifications).length === 0 && (
              <p className="text-gray-500">No {tab} accounts to review yet.</p>
            )}

            {(tab === "club" ? clubVerifications : scoutVerifications).map((account) => (
              <div key={account.id} className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{account.display_name || account.email || "Unnamed account"}</p>
                  <p className="text-sm text-gray-500">{account.email}</p>
                </div>

                {account.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAccountStatus(account.id, "verified")}
                      disabled={updating}
                      className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setAccountStatus(account.id, "rejected")}
                      disabled={updating}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      account.status === "verified"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {account.status === "verified" ? "✓ Verified" : "Rejected"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
