"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isContactRequest } from "../../lib/types";
import type { ContactRequest } from "../../lib/types";

export default function ContactRequestsAdmin() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [selected, setSelected] = useState<ContactRequest | null>(null);
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

    async function loadRequests() {
      const { data, error } = await supabase
        .from("contact_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      setRequests(isArrayOf(data, isContactRequest) ? data : []);
    }

    loadRequests();
  }, [checkingAccess, reloadIndex]);

  async function updateStatus(id: number, status: "accepted" | "rejected") {
    setUpdating(true);

    const { error } = await supabase
      .from("contact_requests")
      .update({ status })
      .eq("id", id);

    setUpdating(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setSelected(null);
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

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-8">
          Contact Requests
        </h1>

        {requests.length === 0 && (
          <p className="text-gray-500">No contact requests to show.</p>
        )}

        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="font-semibold text-gray-900">
                  Player #{request.player_id} · {request.request_type || "General"}
                </p>
                <p className="text-sm text-gray-500">
                  From: {request.sender_type || "Unknown"} ·{" "}
                  {request.created_at ? new Date(request.created_at).toLocaleDateString() : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    request.status === "accepted"
                      ? "bg-green-100 text-green-800"
                      : request.status === "rejected"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {request.status || "pending"}
                </span>

                <button
                  onClick={() => setSelected(request)}
                  className="bg-black text-white text-sm px-4 py-2 rounded-lg"
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Request Details</h3>

            <dl className="space-y-2 text-sm mb-6">
              <div className="flex justify-between">
                <dt className="text-gray-500">Player</dt>
                <dd className="font-medium">#{selected.player_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Type</dt>
                <dd className="font-medium">{selected.request_type || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sender Type</dt>
                <dd className="font-medium">{selected.sender_type || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium">{selected.status || "pending"}</dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">Message</dt>
                <dd className="bg-gray-50 rounded-lg p-3">{selected.message || "No message provided."}</dd>
              </div>
            </dl>

            <div className="flex gap-3">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => updateStatus(selected.id, "rejected")}
                disabled={updating}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-50"
              >
                Reject
              </button>
              <button
                onClick={() => updateStatus(selected.id, "accepted")}
                disabled={updating}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-semibold disabled:opacity-50"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
