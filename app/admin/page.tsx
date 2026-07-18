"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function AdminPanel() { 
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [requests, setRequests] = useState<any[]>([]); 

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

        <div className="grid md:grid-cols-4 gap-6 mb-8">

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-4xl font-bold text-green-600">12,450</h2>
            <p>Total Players</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-4xl font-bold text-green-600">580</h2>
            <p>Verified Clubs</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-4xl font-bold text-green-600">320</h2>
            <p>Scouts</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md">
            <h2 className="text-4xl font-bold text-green-600">96%</h2>
            <p>Approval Rate</p>
          </div>

        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">

          <h2 className="text-3xl font-bold mb-6">
            Pending Approvals
          </h2>

          <div className="space-y-4">

            <div className="border rounded-xl p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold">Jerome Abah</h3>
                <p>Player Verification Request</p>
              </div>

              <div className="flex gap-2">
                <button className="bg-green-600 text-white px-4 py-2 rounded-lg">
                  Approve
                </button>

                <button className="bg-red-600 text-white px-4 py-2 rounded-lg">
                  Reject
                </button>
              </div>
            </div>

            <div className="border rounded-xl p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold">FC Bombonera</h3>
                <p>Club Verification Request</p>
              </div>

              <div className="flex gap-2">
                <button className="bg-green-600 text-white px-4 py-2 rounded-lg">
                  Approve
                </button>

                <button className="bg-red-600 text-white px-4 py-2 rounded-lg">
                  Reject
                </button>
              </div>
            </div>

          </div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">

  <h2 className="text-3xl font-bold mb-6">
    Contact Requests
  </h2>

  <div className="space-y-4">

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

      </div>

    </main>
  );
}