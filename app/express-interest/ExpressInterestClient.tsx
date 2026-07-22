"use client";

import { use, useState } from "react";
import { supabase } from "../lib/supabase";

// All logic and JSX below is unchanged from the previous ExpressInterestForm,
// except: useSearchParams() + its useEffect are replaced by unwrapping the
// searchParams prop directly with use() (Next.js's current recommended
// pattern for this exact scenario - see page.tsx for why).
export default function ExpressInterestClient({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  const params = use(searchParams);

  const [playerId, setPlayerId] = useState(params.player || "");
  const [requestType, setRequestType] = useState("Trial Invitation");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function sendRequest() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;

    if (!user) {
      alert("Please sign in.");
      return;
    }

    const playerIdNumber = Number(playerId);
    if (!playerId || !Number.isFinite(playerIdNumber) || playerIdNumber <= 0) {
      alert("No player selected. Please go back and choose a player first.");
      return;
    }

    if (!message.trim()) {
      alert("Please add a message before sending.");
      return;
    }

    setSending(true);

    const payload = {
      sender_id: user.id,
      player_id: playerIdNumber,
      sender_type: user.user_metadata?.account_type || "scout",
      request_type: requestType,
      message,
    };

    const { error } = await supabase
      .from("contact_requests")
      .insert(payload)
      .select();

    setSending(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Interest request sent to ScoutAfrica.");

    setPlayerId("");
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-xl p-8">

        <h1 className="text-4xl font-bold mb-8">
          ⚽ Express Interest
        </h1>

        <label className="font-semibold">
          Player ID
        </label>

        <input
         readOnly
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="w-full border rounded-lg p-3 mt-2 mb-6"
          placeholder="Player ID"
        />

        <label className="font-semibold">
          Request Type
        </label>

        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value)}
          className="w-full border rounded-lg p-3 mt-2 mb-6"
        >
          <option>Trial Invitation</option>
          <option>Contract Discussion</option>
          <option>Player Evaluation</option>
          <option>Academy Opportunity</option>
        </select>

        <label className="font-semibold">
          Message
        </label>

        <textarea
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full border rounded-lg p-3 mt-2"
          placeholder="Write your message..."
        />

        <button
          onClick={sendRequest}
          disabled={sending}
          className="mt-8 w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl"
        >
          {sending ? "Sending..." : "Send Request"}
        </button>

      </div>
    </main>
  );
}
