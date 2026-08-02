"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isSupportTicket } from "../../lib/types";
import type { SupportTicket, SupportTicketStatus } from "../../lib/types";
import { FiArrowLeft, FiDownload, FiX, FiPaperclip, FiAlertCircle } from "react-icons/fi";

// This page reads/writes support_tickets directly via the authenticated
// admin's own Supabase session - RLS already grants admins SELECT and
// UPDATE on this table (tested directly against live data before writing
// any of this page), so no new API route is needed for any of it,
// including attachment downloads (the storage policy already includes
// an admin bypass too).

const STATUS_OPTIONS: SupportTicketStatus[] = ["Open", "In Progress", "Closed"];
const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"] as const;

const STATUS_BADGE: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800",
  "In Progress": "bg-amber-100 text-amber-800",
  Resolved: "bg-green-100 text-green-800",
  Closed: "bg-gray-200 text-gray-700",
};

const PRIORITY_BADGE: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Normal: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-800",
  Urgent: "bg-red-100 text-red-700",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SupportTicketsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | SupportTicketStatus>("All");
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false); 
  const [saveMessage, setSaveMessage] = useState("");
  const [attachmentDownloading, setAttachmentDownloading] = useState(false);

  useEffect(() => {
    // Identical pattern to every other admin sub-page in this project
    // (e.g. app/admin/contact-requests/page.tsx) - preserved exactly,
    // not modified or reinvented for this new page.
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
      loadTickets();
    }

    async function loadTickets() {
      setLoading(true);
      setLoadError(false);

      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load support tickets:", error);
        setLoadError(true);
        setLoading(false);
        return;
      }

      setTickets(isArrayOf(data, isSupportTicket) ? data : []);
      setLoading(false);
    }

    checkAccess();
  }, [router]);

  const stats = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === "Open").length,
      inProgress: tickets.filter((t) => t.status === "In Progress").length,
      closed: tickets.filter((t) => t.status === "Closed").length,
    }),
    [tickets]
  );

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tickets.filter((t) => {
      const matchesStatus = statusFilter === "All" || t.status === statusFilter;
      if (!matchesStatus) return false;

      if (!q) return true;

      return (
        (t.full_name || "").toLowerCase().includes(q) ||
        (t.email || "").toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q)
      );
    });
  }, [tickets, search, statusFilter]);

  function openTicket(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setNotesDraft(ticket.admin_notes || "");
  }

  async function handleStatusChange(newStatus: SupportTicketStatus) {
    if (!selectedTicket) return;

    setSavingStatus(true);
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: newStatus })
      .eq("id", selectedTicket.id);

    if (!error) {
      const updated = { ...selectedTicket, status: newStatus };
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((t) => (t.id === selectedTicket.id ? updated : t)));
    } else {
      console.error("Failed to update status:", error);
    }
    setSavingStatus(false);
  }

  async function handlePriorityChange(newPriority: string) {
    if (!selectedTicket) return;

    setSavingPriority(true);
    const { error } = await supabase
      .from("support_tickets")
      .update({ priority: newPriority })
      .eq("id", selectedTicket.id);

    if (!error) {
      const updated = { ...selectedTicket, priority: newPriority } as SupportTicket;
      setSelectedTicket(updated);
      setTickets((prev) => prev.map((t) => (t.id === selectedTicket.id ? updated : t)));
    } else {
      console.error("Failed to update priority:", error);
    }
    setSavingPriority(false);
  }

  async function handleSaveNotes() {
    if (!selectedTicket) return;

    setSavingNotes(true);
    const { error } = await supabase
      .from("support_tickets")
      .update({ admin_notes: notesDraft })
      .eq("id", selectedTicket.id);

    if (error) {
  console.error("Failed to save admin notes:", error);
  setSaveMessage("❌ Failed to save notes.");
} else {
  setSaveMessage("✅ Notes saved successfully!");
  setTimeout(() => setSaveMessage(""), 3000);
}
    setSavingNotes(false);
  }

  async function handleDownloadAttachment() {
    const path = selectedTicket?.attachment_url;
    if (!path) return;

    setAttachmentDownloading(true);
    // Signed URL generated on demand - the stored value is the storage
    // PATH, not a permanent link, so a fresh signed URL is created only
    // when actually needed.
    const { data, error } = await supabase.storage
      .from("support-attachments")
      .createSignedUrl(path, 60);

    setAttachmentDownloading(false);

    if (error || !data?.signedUrl) {
      console.error("Failed to generate attachment link:", error);
      alert("Could not generate a download link for this attachment.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-green-700 text-sm font-medium mb-4">
          <FiArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Support Ticket Management</h1>
        <p className="text-gray-500 mt-1 mb-6">Manage and respond to customer support requests.</p>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Tickets", value: stats.total },
            { label: "Open", value: stats.open },
            { label: "In Progress", value: stats.inProgress },
            { label: "Closed", value: stats.closed },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <p className="text-2xl font-bold text-gray-900 tracking-tight">
                {loading ? <span className="inline-block h-7 w-10 bg-gray-100 rounded animate-pulse" /> : card.value}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, subject, or message..."
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <div className="flex gap-2 flex-wrap">
            {(["All", ...STATUS_OPTIONS] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  statusFilter === s ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loadError ? (
            <div className="p-10 text-center">
              <FiAlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">Something went wrong loading tickets.</p>
              <p className="text-gray-400 text-sm mt-1">Please refresh the page to try again.</p>
            </div>
          ) : loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              {tickets.length === 0 ? "No support tickets yet." : "No tickets match your search or filter."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 text-xs uppercase tracking-wide">
                    <th className="p-4">ID</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Subject</th>
                    <th className="p-4">Reason</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Date Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => openTicket(ticket)}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="p-4 text-gray-400 font-mono text-xs">#{ticket.id}</td>
                      <td className="p-4 text-gray-900 font-medium">{ticket.full_name || "—"}</td>
                      <td className="p-4 text-gray-600">{ticket.email || "—"}</td>
                      <td className="p-4 text-gray-900 max-w-[220px] truncate">{ticket.subject}</td>
                      <td className="p-4 text-gray-600">{ticket.reason}</td>
                      <td className="p-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[ticket.status]}`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PRIORITY_BADGE[ticket.priority]}`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 whitespace-nowrap">{formatDate(ticket.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail side panel */}
      {selectedTicket && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedTicket(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[460px] bg-white shadow-2xl z-50 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900">Ticket #{selectedTicket.id}</h2>
              <button
                onClick={() => setSelectedTicket(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close ticket details"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Full Name</p>
                <p className="text-gray-900 mt-0.5">{selectedTicket.full_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</p>
                <p className="text-gray-900 mt-0.5">{selectedTicket.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Subject</p>
                <p className="text-gray-900 mt-0.5">{selectedTicket.subject}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reason</p>
                <p className="text-gray-900 mt-0.5">{selectedTicket.reason}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Message</p>
                <p className="text-gray-700 mt-0.5 whitespace-pre-line leading-relaxed">{selectedTicket.message}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Date Submitted</p>
                <p className="text-gray-900 mt-0.5">{formatDate(selectedTicket.created_at)}</p>
              </div>

              {selectedTicket.attachment_url && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Attachment</p>
                  <button
                    onClick={handleDownloadAttachment}
                    disabled={attachmentDownloading}
                    className="flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <FiPaperclip className="w-4 h-4" />
                    {attachmentDownloading ? "Generating link..." : "Download Attachment"}
                    <FiDownload className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="pt-5 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Status</p>
                <select
                  value={selectedTicket.status}
                  onChange={(e) => handleStatusChange(e.target.value as SupportTicketStatus)}
                  disabled={savingStatus}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Priority</p>
                <select
                  value={selectedTicket.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  disabled={savingPriority}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Admin Notes</p>
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Internal notes - not visible to the customer..."
                  style={{ minHeight: "100px" }}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="mt-2 bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {savingNotes ? "Saving..." : "Save Changes"}
                </button>  
                {saveMessage && (
  <p
    className={`mt-3 text-sm font-medium ${
      saveMessage.includes("Failed")
        ? "text-red-600"
        : "text-green-600"
    }`}
  >
    {saveMessage}
  </p>
)}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}