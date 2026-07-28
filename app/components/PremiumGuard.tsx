"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isPremium } from "../lib/isPremium";

const BENEFITS = [
  "Direct messaging with players, scouts, and clubs",
  "Unlimited highlight video uploads",
  "A gold Premium badge on your profile",
  "Priority exposure in search results",
  "Advanced scout search filters",
];

// Wraps any Premium-only feature. Shows children only once the CURRENT
// signed-in user is confirmed premium via the single, tested isPremium()
// helper - never a second, ad-hoc check. This is a CLIENT-SIDE
// convenience only; every route this gates data for must ALSO use
// requirePremium() server-side (see app/lib/requirePremium.ts), since a
// client-side guard alone can always be bypassed by calling the API
// directly.
export default function PremiumGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const premium = await isPremium(user?.id);

      if (!cancelled) {
        setHasPremium(premium);
        setChecking(false);
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return <div className="animate-pulse bg-gray-100 rounded-2xl h-48" />;
  }

  if (hasPremium) {
    return <>{children}</>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8 text-center">
      <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
        ⭐ Premium Feature
      </span>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Unlock this with ScoutAfrica Premium
      </h2>
      <p className="text-gray-500 mb-6 max-w-md mx-auto">
        This feature is available to Premium members. Upgrade to unlock it and more.
      </p>

      <ul className="text-left max-w-sm mx-auto space-y-2 mb-8">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-gray-700">
            <span className="text-green-600 mt-0.5">✓</span>
            {benefit}
          </li>
        ))}
      </ul>

      <a
        href="/subscription"
        className="inline-block bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5"
      >
        Upgrade to Premium
      </a>
    </div>
  );
}
