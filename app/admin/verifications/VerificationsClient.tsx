"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import {
  isAccountVerification,
  isAccountVerificationHistory,
  isArrayOf,
  isPlayer,
  isVerificationDocument,
} from "../../lib/types";
import type {
  AccountVerification,
  AccountVerificationHistory,
  Player,
  VerificationDocument,
} from "../../lib/types";

type Tab = "player" | "club" | "scout" | "agent" | "academy";
type ModalMode = { id: number; kind: "reject" | "revoke" | "more_info" } | null;

const DOCUMENT_LABELS: Record<VerificationDocument["document_type"], string> = {
  business_registration: "Business Registration",
  fa_license: "Football Association License",
  government_registration: "Government Registration",
  supporting: "Supporting Document",
};

const STATUS_BADGE: Record<string, string> = {
  verified: "bg-green-100 text-green-800",
  rejected: "bg-gray-200 text-gray-700",
  more_info_requested: "bg-orange-100 text-orange-800",
  pending: "bg-amber-100 text-amber-800",
};

const STATUS_LABEL: Record<string, string> = {
  verified: "🟢 Verified",
  rejected: "⚫ Rejected",
  more_info_requested: "🟠 More Info Requested",
  pending: "🟡 Pending",
};

const HISTORY_ACTION_LABEL: Record<string, string> = {
  submitted: "Application submitted",
  resubmitted: "Application resubmitted",
  verified: "Approved",
  rejected: "Rejected",
  more_info_requested: "More information requested",
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
  const [historyByApplication, setHistoryByApplication] = useState<Record<number, AccountVerificationHistory[]>>({});
  const [modal, setModal] = useState<ModalMode>(null);
  const [modalNote, setModalNote] = useState("");
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<number | null>(null);

  useEffect(() => {
    // Identical to every other admin sub-page in this project - preserved
    // exactly, not modified.
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

  async function loadDetails(applicationId: number) {
    if (expandedId === applicationId) {
      setExpandedId(null);
      return;
    }

    if (!documentsByApplication[applicationId]) {
      const { data } = await supabase
        .from("verification_documents")
        .select("*")
        .eq("application_id", applicationId);

      setDocumentsByApplication((prev) => ({
        ...prev,
        [applicationId]: isArrayOf(data, isVerificationDocument) ? data : [],
      }));
    }

    if (!historyByApplication[applicationId]) {
      const { data } = await supabase
        .from("account_verification_history")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });

      setHistoryByApplication((prev) => ({
        ...prev,
        [applicationId]: isArrayOf(data, isAccountVerificationHistory) ? data : [],
      }));
    }

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

  // One place every status-changing action goes through, so a history
  // row is always written alongside the status change itself - never two
  // separate call sites that could drift out of sync.
  async function setAccountStatus(
    id: number,
    status: "verified" | "rejected" | "more_info_requested",
    note?: string
  ) {
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
        rejection_reason: status === "rejected" ? note || null : null,
        review_notes: status === "more_info_requested" ? note || null : null,
      })
      .eq("id", id);

    if (!error) {
      await supabase.from("account_verification_history").insert({
        application_id: id,
        action: status,
        actor_id: user?.id,
        note: note || null,
      });
    }

    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setModal(null);
    setModalNote("");
    setReloadIndex((i) => i + 1);
  }

  async function saveReviewNotes(id: number) {
    setSavingNotesId(id);
    const { error } = await supabase
      .from("account_verifications")
      .update({ review_notes: notesDraft[id] ?? "" })
      .eq("id", id);
    setSavingNotesId(null);

    if (error) {
      console.error(error);
      alert(error.message);
    }
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const totalApplications = pendingPlayers.length + verifiedPlayers.length + orgVerifications.length;
  const totalPending =
    pendingPlayers.length + orgVerifications.filter((a) => a.status === "pending").length;
  const totalApproved =
    verifiedPlayers.length + orgVerifications.filter((a) => a.status === "verified").length;
  const totalRejected = orgVerifications.filter((a) => a.status === "rejected").length;

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/admin" className="text-green-700 text-sm font-medium">
          ← Back to Admin Dashboard
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-6">
          Verifications
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Applications", value: totalApplications },
            { label: "Pending", value: totalPending },
            { label: "Approved", value: totalApproved },
            { label: "Rejected", value: totalRejected },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

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
                <p className="text-gray-500">No pending player verifications.</p>
              ) : (
                <div className="space-y-2">
                  {pendingPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{player.full_name || "Unnamed Player"}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {player.scoutafrica_id} · {player.position || "Position unknown"}
                        </p>
                      </div>
                      <button
                        onClick={() => setPlayerVerified(player.id, true)}
                        disabled={updating}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50 shrink-0"
                      >
                        Verify
                      </button>
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
                <div className="space-y-2">
                  {verifiedPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{player.full_name || "Unnamed Player"}</p>
                        <p className="text-sm text-gray-500 truncate">{player.scoutafrica_id}</p>
                      </div>
                      <button
                        onClick={() => setPlayerVerified(player.id, false)}
                        disabled={updating}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50 shrink-0"
                      >
                        Unverify
                      </button>
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
              <div className="flex gap-2 flex-wrap">
                {(["all", "pending", "more_info_requested", "verified", "rejected"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize ${
                      statusFilter === s ? "bg-green-600 text-white" : "bg-white text-gray-600 border border-gray-200"
                    }`}
                  >
                    {s === "all" ? "All" : s === "more_info_requested" ? "More Info" : s}
                  </button>
                ))}
              </div>
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
                    const docs = documentsByApplication[account.id] || [];
                    const history = historyByApplication[account.id] || [];

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
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[account.status]}`}>
                            {STATUS_LABEL[account.status]}
                          </span>

                          <button
                            onClick={() => loadDetails(account.id)}
                            className="text-xs text-green-700 font-medium underline"
                          >
                            {expandedId === account.id ? "Hide details" : "View details"}
                          </button>
                        </div>
                      </div>

                      {expandedId === account.id && (
                        <div className="mt-4 pt-4 border-t border-gray-100 text-sm space-y-4">
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
                            {docs.length === 0 ? (
                              <p className="text-gray-400 text-xs">No documents uploaded.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {docs.map((doc) => (
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

                          {/* Internal review notes - separate from rejection_reason, never shown to the applicant except when a "more info requested" notification is sent */}
                          <div>
                            <p className="text-gray-400 mb-1">Internal Review Notes</p>
                            <textarea
                              value={notesDraft[account.id] ?? account.review_notes ?? ""}
                              onChange={(e) =>
                                setNotesDraft((prev) => ({ ...prev, [account.id]: e.target.value }))
                              }
                              rows={2}
                              placeholder="Notes visible only to ScoutAfrica admins..."
                              className="w-full border rounded-lg p-2.5 text-sm"
                            />
                            <button
                              onClick={() => saveReviewNotes(account.id)}
                              disabled={savingNotesId === account.id}
                              className="mt-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              {savingNotesId === account.id ? "Saving..." : "Save Notes"}
                            </button>
                          </div>

                          {/* Timeline */}
                          {history.length > 0 && (
                            <div>
                              <p className="text-gray-400 mb-1.5">Timeline</p>
                              <div className="space-y-2">
                                {history.map((event) => (
                                  <div key={event.id} className="flex items-start gap-2 text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 shrink-0" />
                                    <div>
                                      <p className="text-gray-700 font-medium">
                                        {HISTORY_ACTION_LABEL[event.action] || event.action}
                                      </p>
                                      <p className="text-gray-400">{formatTimestamp(event.created_at)}</p>
                                      {event.note && <p className="text-gray-500 mt-0.5">{event.note}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {(account.status === "pending" || account.status === "more_info_requested") && (
                            <div className="flex gap-2 pt-2 flex-wrap">
                              <button
                                onClick={() => setAccountStatus(account.id, "verified")}
                                disabled={updating}
                                className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setModal({ id: account.id, kind: "reject" })}
                                disabled={updating}
                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => setModal({ id: account.id, kind: "more_info" })}
                                disabled={updating}
                                className="bg-orange-50 hover:bg-orange-100 text-orange-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                Request More Information
                              </button>
                            </div>
                          )}

                          {account.status === "verified" && (
                            <div className="pt-2">
                              <button
                                onClick={() => setModal({ id: account.id, kind: "revoke" })}
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

        {modal !== null && (() => {
          const titles: Record<"reject" | "revoke" | "more_info", string> = {
            reject: "Reject Application",
            revoke: "Revoke Verification",
            more_info: "Request More Information",
          };
          const buttonLabels: Record<"reject" | "revoke" | "more_info", string> = {
            reject: "Confirm Rejection",
            revoke: "Confirm Revocation",
            more_info: "Send Request",
          };
          const buttonColors: Record<"reject" | "revoke" | "more_info", string> = {
            reject: "bg-red-600 hover:bg-red-700",
            revoke: "bg-red-600 hover:bg-red-700",
            more_info: "bg-orange-600 hover:bg-orange-700",
          };

          function confirmModal() {
            if (!modal) return;
            const targetStatus = modal.kind === "more_info" ? "more_info_requested" : "rejected";
            setAccountStatus(modal.id, targetStatus, modalNote);
          }

          return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-xl font-bold mb-4">{titles[modal.kind]}</h3>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {modal.kind === "more_info" ? "What's missing or unclear?" : "Reason"}{" "}
                <span className="text-gray-400 font-normal">
                  {modal.kind === "more_info" ? "(shown to the organization)" : "(optional, shown to the organization)"}
                </span>
              </label>
              <textarea
                value={modalNote}
                onChange={(e) => setModalNote(e.target.value)}
                rows={3}
                className="w-full border rounded-lg p-3 mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setModal(null);
                    setModalNote("");
                  }}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal}
                  disabled={updating}
                  className={`flex-1 text-white py-2.5 rounded-xl font-semibold disabled:opacity-50 ${buttonColors[modal.kind]}`}
                >
                  {updating ? "Processing..." : buttonLabels[modal.kind]}
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

function formatTimestamp(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
