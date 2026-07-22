"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isContactRequest } from "../../lib/types";
import type { ContactRequest } from "../../lib/types";

export default function ContactRequests() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);

  useEffect(() => {
    async function loadRequests() {
      const { data } = await supabase
        .from("contact_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (isArrayOf(data, isContactRequest)) setRequests(data);
    }

    loadRequests();
  }, []);

  return (
    <main className="max-w-7xl mx-auto py-10">

      <h1 className="text-4xl font-bold mb-8">
        📩 Contact Requests
      </h1>

      <div className="space-y-4">

        {requests.map((request) => (

          <div
            key={request.id}
            className="bg-white rounded-xl shadow p-6 flex justify-between items-center"
          >

            <div>

              <h2 className="font-bold text-xl">
                Player #{request.player_id}
              </h2>

              <p>
                Request:
                {" "}
                {request.request_type}
              </p>

              <p className="text-gray-500">
                {request.status}
              </p>

            </div>

            <button
              disabled
              title="Coming soon"
              className="bg-blue-300 text-white px-5 py-2 rounded-lg cursor-not-allowed"
            >
              Review (Coming Soon)
            </button>

          </div>

        ))}

      </div>

    </main>
  );
}