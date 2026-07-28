"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { isPremium } from "../lib/isPremium";

// Ready for a future Player Recommendations feature to plug into - same
// pattern as AIAnalysisPlaceholder.tsx (kept as a separate component
// rather than one generic "coming soon" wrapper, since these are two
// distinct future features with their own copy/branding, not one
// interchangeable placeholder).
export default function PlayerRecommendationsPlaceholder() {
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
    return <div className="animate-pulse bg-gray-100 rounded-2xl h-32" />;
  }

  if (!hasPremium) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-6 text-center">
        <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-3">
          ⭐ Premium Feature
        </span>
        <h3 className="font-bold text-gray-900 mb-1">Player Recommendations</h3>
        <p className="text-gray-500 text-sm mb-4">
          Upgrade to Premium to unlock personalized player recommendations.
        </p>
        <a
          href="/membership"
          className="inline-block bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-200"
        >
          Upgrade to Premium
        </a>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
      <h3 className="font-bold text-gray-900 mb-1">Player Recommendations</h3>
      <p className="text-gray-500 text-sm">
        This feature is coming soon for Premium members.
      </p>
    </div>
  );
}
