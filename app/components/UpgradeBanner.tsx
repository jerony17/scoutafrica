"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isPremium } from "../lib/isPremium";

const UNLOCKS = [
  "Direct Messaging",
  "Unlimited Videos",
  "Verified Premium Badge",
  "Priority Exposure",
  "Advanced Filters",
];

// Self-contained: checks the current user's premium status itself, so
// dropping this into any dashboard requires no data-fetching from the
// caller. Renders nothing at all for premium users or while loading -
// never shows a flash of the banner to someone who's already premium.
export default function UpgradeBanner() {
  const [checking, setChecking] = useState(true);
  const [hasPremium, setHasPremium] = useState(true); // default true so nothing flashes before the check resolves

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

  if (checking || hasPremium) return null;

  return (
    <a
      href="/membership"
      className="group block bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 rounded-2xl p-6 sm:p-8 mb-8 shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-white/90 text-xs font-semibold tracking-[0.15em] uppercase mb-1">
            ⭐ ScoutAfrica Premium
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Upgrade to Premium</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {UNLOCKS.map((item) => (
              <span key={item} className="text-white/90 text-sm flex items-center gap-1.5">
                <span className="text-white">✓</span>
                {item}
              </span>
            ))}
          </div>
        </div>

        <span className="bg-white text-amber-600 font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all duration-200 group-hover:shadow-md shrink-0">
          Upgrade Now →
        </span>
      </div>
    </a>
  );
}
