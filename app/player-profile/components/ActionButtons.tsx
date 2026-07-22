"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Player } from "../../lib/types";

type Props = {
  player: Player;
  addToWatchlist: (playerId: number) => void;
  savingWatchlist: boolean;
};

// Every action here keeps interaction inside ScoutAfrica - no external
// social/contact links anywhere on this profile. Express Interest and
// Request Contact both route through the existing contact_requests +
// /express-interest infrastructure rather than a second, separate system.
export default function ActionButtons({ player, addToWatchlist, savingWatchlist }: Props) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [copied, setCopied] = useState(false);

  function expressInterest() {
    window.location.href = `/express-interest?player=${player.id}`;
  }

  function requestContact() {
    window.location.href = `/express-interest?player=${player.id}&type=contact`;
  }

  async function shareProfile() {
    const url = `${window.location.origin}/player-profile/${player.slug}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(url);
    }
  }

  async function submitReport() {
    if (!reportReason.trim()) {
      alert("Please select a reason for this report.");
      return;
    }

    setSubmittingReport(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("Please sign in to report a profile.");
      setSubmittingReport(false);
      return;
    }

    const { error } = await supabase.from("player_reports").insert({
      player_id: player.id,
      reporter_id: user.id,
      reason: reportReason,
      details: reportDetails || null,
    });

    setSubmittingReport(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    alert("Thank you - your report has been sent to the ScoutAfrica team for review.");
    setShowReportModal(false);
    setReportReason("");
    setReportDetails("");
  }

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button
        onClick={expressInterest}
        className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition"
      >
        Express Interest
      </button>

      <button
        onClick={() => addToWatchlist(player.id)}
        disabled={savingWatchlist}
        className="bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 px-5 py-2.5 rounded-xl font-semibold shadow-sm transition disabled:opacity-50"
      >
        {savingWatchlist ? "Saving..." : "⭐ Add to Watchlist"}
      </button>

      <button
        onClick={requestContact}
        className="bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 px-5 py-2.5 rounded-xl font-semibold shadow-sm transition"
      >
        Request Contact
      </button>

      <button
        onClick={shareProfile}
        className="bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 px-5 py-2.5 rounded-xl font-semibold shadow-sm transition"
      >
        {copied ? "Link copied!" : "Share Profile"}
      </button>

      <button
        onClick={() => setShowReportModal(true)}
        className="text-gray-400 hover:text-red-600 px-5 py-2.5 rounded-xl font-semibold transition text-sm"
      >
        Report Profile
      </button>

      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Report this profile</h3>

            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full border rounded-lg p-3 mb-4"
            >
              <option value="">Select a reason</option>
              <option value="Fake or impersonated profile">Fake or impersonated profile</option>
              <option value="Inappropriate content">Inappropriate content</option>
              <option value="Misleading information">Misleading information</option>
              <option value="Other">Other</option>
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional details (optional)
            </label>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={3}
              className="w-full border rounded-lg p-3 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowReportModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={submittingReport}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-50"
              >
                {submittingReport ? "Sending..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
