"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function AdminPanel() { 
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  // Defense-in-depth: proxy.ts is the primary route guard for this page. This check
  // exists in case that layer is misconfigured (see Sprint 1A follow-up investigation
  // - this is exactly what happened, so this check is not optional here). Unlike the
  // other dashboards, this checks app_metadata.is_admin, which the client cannot edit,
  // so this check is a real (if secondary) security boundary, not just UX.
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
    loadRequests();
    loadTotalPlayers();
  }

async function loadTotalPlayers() {
  const { count, error } = await supabase
    .from("player")
    .select("*", { count: "exact", head: true });

  if (!error) {
    setTotalPlayers(count ?? 0);
  }
}

async function loadRequests() {
  const { data, error } = await supabase
    .from("contact_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  setRequests(data || []);
}

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">

      <div className="max-w-7xl mx-auto">

        <h1 className="text-5xl font-bold text-green-700 mb-8">
          Admin Panel
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-4xl font-bold text-green-600">
              {totalPlayers ?? "0"}
            </h2>
            <p>Total Players</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
            <p>Verified Clubs</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
            <p>Scouts</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
            <p>Approval Rate</p>
          </div>

        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">

          <h2 className="text-3xl font-bold mb-6">
            Pending Approvals
          </h2>

          <div className="border border-dashed rounded-xl p-8 text-center text-gray-400">
            Verification workflow coming soon.
          </div>

          </div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">

  <h2 className="text-3xl font-bold mb-6">
    Contact Requests
  </h2>

  <div className="space-y-4">

    {requests.length === 0 && (
      <p className="text-gray-500">
        No contact requests to show for this account.
      </p>
    )}

    {requests.map((request) => (

      <div
        key={request.id}
        className="border rounded-xl p-4 flex justify-between items-center"
      >

        <div>

          <h3 className="font-bold">
            Player #{request.player_id}
          </h3>

          <p>{request.request_type}</p>

          <p className="text-gray-500">
            {request.status}
          </p>

        </div>

        <Link
          href={`/admin/contact-requests/${request.id}`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Review
        </Link>

      </div>

    ))}

  </div>

</div>

      </div>

    </main>
  );
}