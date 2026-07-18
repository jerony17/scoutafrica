"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function ContactRequests() {
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    const { data } = await supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setRequests(data);
  }

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

            <Link
              href={`/admin/contact-requests/${request.id}`}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg"
            >
              Review
            </Link>

          </div>

        ))}

      </div>

    </main>
  );
}