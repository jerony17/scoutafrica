"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isAccountVerification, isArrayOf, isPlayer, isVerificationDocument } from "../../lib/types";
import type { AccountVerification, Player, VerificationDocument } from "../../lib/types";

type Tab = "player" | "club" | "scout" | "agent" | "academy";

const DOCUMENT_LABELS: Record<VerificationDocument["document_type"], string> = {
  business_registration: "Business Registration",
  fa_license: "Football Association License",
  government_registration: "Government Registration",
  supporting: "Supporting Document",
};

export default function VerificationsClient({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = use(searchParams);
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [tab, setTab] = useState<Tab>(
    params.type === "club" || params.type === "scout" || params.type === "agent" || params.type === "academy"
      ? params.type
      : "player"
  );

  const [pendingPlayers, setPendingPlayers] = useState<Player[]>([]);
  const [verifiedPlayers, setVerifiedPlayers] = useState<Player[]>([]);
  const [orgVerifications, setOrgVerifications] = useState<AccountVerification[]>([]);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountVerification["status"]>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [documentsByApplication, setDocumentsByApplication] = useState<Record<number, VerificationDocument[]>>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

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
      const [pending, verified, orgs] = await Promise.all([
        supabase.from("player").select("*").or("verified.is.null,verified.eq.false"),
        supabase.from("player").select("*").eq("verified", true),
        supabase.from("account_verifications").select("*").order("created_at", { ascending: false }),
      ]);

      setPendingPlayers(isArrayOf(pending.data, isPlayer) ? pending.data : []);
      setVerifiedPlayers(isArrayOf(verified.data, isPlayer) ? verified.data : []);
      setOrgVerifications(isArrayOf(orgs.data, isAccountVerification) ? orgs.data : []);
    }

    loadData();
  }, [checkingAccess, reloadIndex]);

  async function loadDocuments(applicationId: number) {
    if (documentsByApplication[applicationId]) {
      setExpandedId(expandedId === applicationId ? null : applicationId);
      return;
    }

    const { data } = await supabase
      .from("verification_documents")
      .select("*")
      .eq("application_id", applicationId);

    setDocumentsByApplication((prev) => ({
      ...prev,
      [applicationId]: isArrayOf(data, isVerificationDocument) ? data : [],
    }));
    setExpandedId(applicationId);
  }

  async function previewDocument(doc: VerificationDocument) {
    const { data, error } = await supabase.storage
      .from("verification-documents")
      .createSignedUrl(doc.storage_path, 120);

    if (error || !data?.signedUrl) {
      alert("Could not generate a preview link for this document.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

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

  async function setAccountStatus(id: number, status: "verified" | "rejected", reason?: string) {
    setUpdating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("account_verifications")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: status === "rejected" ? reason || null : null,
      })
      .eq("id", id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setRejectingId(null);
    setRejectionReason("");
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

        <div className="flex gap-2 mb-8 flex-wrap">
          {(["player", "club", "scout", "agent", "academy"] as Tab[]).map((t) => (
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

        {(tab === "club" || tab === "scout" || tab === "agent" || tab === "academy") && (
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by organization name..."
                className="flex-1 border rounded-lg p-2.5 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="border rounded-lg p-2.5 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending Review</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {(() => {
              const filtered = orgVerifications
                .filter((a) => a.account_type === tab)
                .filter((a) => statusFilter === "all" || a.status === statusFilter)
                .filter((a) => {
                  const q = search.trim().toLowerCase();
                  if (!q) return true;
                  return (a.organization_name || a.display_name || "").toLowerCase().includes(q);
                });

              if (filtered.length === 0) {
                return <p className="text-gray-500">No {tab} applications match your filters.</p>;
              }

              return (
                <div className="space-y-3">
                  {filtered.map((account) => {
                    return (
                    <div key={account.id} className="bg-white rounded-xl shadow-sm p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {account.organization_name || account.display_name || "Unnamed account"}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {[account.city, account.country].filter(Boolean).join(", ") || account.email}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-xs font-semibold px-3 py-1 rounded-full ${
                              account.status === "verified"
                                ? "bg-green-100 text-green-800"
                                : account.status === "rejected"
                                  ? "bg-gray-200 text-gray-700"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {account.status === "verified"
                              ? "🟢 Verified"
                              : account.status === "rejected"
                                ? "⚫ Rejected"
                                : "🟡 Pending"}
                          </span>

                          <button
                            onClick={() => loadDocuments(account.id)}
                            className="text-xs text-green-700 font-medium underline"
                          >
                            {expandedId === account.id ? "Hide details" : "View details"}
                          </button>
                        </div>
                      </div>

                      {expandedId === account.id && (
                        <div className="mt-4 pt-4 border-t border-gray-100 text-sm space-y-2">
                          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-gray-600">
                            <p><span className="text-gray-400">Representative:</span> {account.representative_name || "—"}</p>
                            <p><span className="text-gray-400">Registration #:</span> {account.registration_number || "—"}</p>
                            <p><span className="text-gray-400">Website:</span> {account.website || "—"}</p>
                            <p><span className="text-gray-400">Email:</span> {account.email || "—"}</p>
                            {account.rejection_reason && (
                              <p className="sm:col-span-2">
                                <span className="text-gray-400">Rejection reason:</span> {account.rejection_reason}
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-gray-400 mb-1">Documents</p>
                            {(documentsByApplication[account.id] || []).length === 0 ? (
                              <p className="text-gray-400 text-xs">No documents uploaded.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {(documentsByApplication[account.id] || []).map((doc) => (
                                  <button
                                    key={doc.id}
                                    onClick={() => previewDocument(doc)}
                                    className="bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs px-3 py-1.5 rounded-lg"
                                  >
                                    📄 {DOCUMENT_LABELS[doc.document_type]}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {account.status === "pending" && (
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => setAccountStatus(account.id, "verified")}
                                disabled={updating}
                                className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectingId(account.id)}
                                disabled={updating}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {account.status === "verified" && (
                            <div className="pt-2">
                              <button
                                onClick={() => setRejectingId(account.id)}
                                disabled={updating}
                                className="bg-red-50 hover:bg-red-100 text-red-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Revoke Verification
                              </button>
                              <p className="text-xs text-gray-400 mt-1">
                                Verification is permanent until manually revoked.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              );
            })()}
          </div>
        )}

        {rejectingId !== null && (() => {
          const target = orgVerifications.find((a) => a.id === rejectingId);
          const isRevoke = target?.status === "verified";
          return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-4">{isRevoke ? "Revoke Verification" : "Reject Application"}</h3>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason <span className="text-gray-400 font-normal">(optional, shown to the organization)</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full border rounded-lg p-3 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setRejectingId(null);
                    setRejectionReason("");
                  }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setAccountStatus(rejectingId, "rejected", rejectionReason)}
                  disabled={updating}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-50"
                >
                  {updating ? "Processing..." : isRevoke ? "Confirm Revocation" : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </div>
          );
        })()}
      </div>
    </main>
  );
}
