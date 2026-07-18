"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/app/lib/supabase";

export default function PlayerRequests() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
  loadRequests();
}, []);

  async function loadRequests() { 

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Find the logged-in player's database record
    const { data: player } = await supabase
      .from("player")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!player) return;

    // Load requests for this player
    const { data } = await supabase
      .from("contact_requests")
      .select("*")
      .eq("player_id", player.id)
      .order("created_at", { ascending: false });

    setRequests(data || []);
  }

  async function updateRequest(id: number, status: string) { 
    console.log("Updating request ID:", id);

  const { data, error } = await supabase
    .from("contact_requests")
    .update({ status })
    .eq("id", id)
    .select();     

  if (status === "accepted" && data && data.length > 0) {
  const request = data[0];

console.log("REQUEST:", request);

const { error: conversationError } = await supabase
  .from("conversations")
  .insert({
    request_id: request.id,
    scout_id: request.sender_id,
    player_id: request.player_id,
  });

console.log("Conversation Error:", conversationError);
}
console.log("UPDATE DATA:", data);
console.log("UPDATE ERROR:", error);

  if (!error) {
    loadRequests();
  }
}
  return (
    <div className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">
        Interest Requests
      </h1>

      {requests.length === 0 ? (
        <p>No requests yet.</p>
      ) : (
        requests.map((request) => (
          <div
            key={request.id}
            className="border rounded-xl p-5 mb-4 shadow"
          >
            <p>
              <strong>Request:</strong> {request.request_type}
            </p>

            <p>
              <strong>Message:</strong> {request.message}
            </p>

            <p>
              <strong>Status:</strong> {request.status}
            </p>

            <div className="mt-4 flex gap-3">
              <button
  onClick={() => updateRequest(request.id, "accepted")}
  className="bg-green-600 text-white px-4 py-2 rounded"
>
  Accept
</button>

            <button
  onClick={() => updateRequest(request.id, "rejected")}
  className="bg-red-600 text-white px-4 py-2 rounded"
>
  Reject
</button>  
            </div>
          </div>
        ))
      )}
    </div>
  );
}