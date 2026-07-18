"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function ClubDashboard() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  // Defense-in-depth: proxy.ts is the primary route guard for this page. This check
  // exists in case that layer is misconfigured (see Sprint 1A follow-up investigation).
  // user_metadata.account_type is a UX/routing check only, never a security boundary.
  async function checkAccess() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/signin");
      return;
    }

    if (user.user_metadata?.account_type !== "club") {
      router.replace("/");
      return;
    }

    setCheckingAccess(false);
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
          Club Dashboard
        </h1>

        <div className="grid md:grid-cols-4 gap-6">

          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <h2 className="text-4xl font-bold text-green-600">120</h2>
            <p>Players Viewed</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <h2 className="text-4xl font-bold text-green-600">35</h2>
            <p>Saved Players</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <h2 className="text-4xl font-bold text-green-600">12</h2>
            <p>Trial Invitations</p>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <h2 className="text-4xl font-bold text-green-600">5</h2>
            <p>Scouts</p>
          </div>

        </div>

        <div className="bg-white rounded-2xl shadow-md p-8 mt-8">

          <h2 className="text-2xl font-bold mb-6">
            Recent Players
          </h2>

          <div className="space-y-4">

            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="font-bold">Jerome Abah</h3>
                <p>Midfielder • Nigeria</p>
              </div>

              <button className="bg-green-600 text-white px-4 py-2 rounded-lg">
                View Profile
              </button>
            </div>

            <div className="flex justify-between items-center border-b pb-4">
              <div>
                <h3 className="font-bold">David Mensah</h3>
                <p>Forward • Ghana</p>
              </div>

              <button className="bg-green-600 text-white px-4 py-2 rounded-lg">
                View Profile
              </button>
            </div>

            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold">Samuel Okoro</h3>
                <p>Defender • Nigeria</p>
              </div>

              <button className="bg-green-600 text-white px-4 py-2 rounded-lg">
                View Profile
              </button>
            </div>

          </div>

        </div>

      </div>
    </main>
  );
}