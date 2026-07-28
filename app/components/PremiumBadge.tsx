"use client";

import { useEffect, useState } from "react";
import { isPremium as checkIsPremium } from "../lib/isPremium";

// Separate from the existing verification badge by design - a user can
// be Verified, Premium, both, or neither. Renders nothing while loading
// or if not premium, so it never shifts layout or shows a false badge.
// Uses the single, shared isPremium() helper - not a second, ad-hoc RPC
// call - so this badge and every other Premium check on the platform
// stay in sync by construction.
export default function PremiumBadge({ userId }: { userId: string | null | undefined }) {
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    let cancelled = false;

    checkIsPremium(userId).then((result) => {
      if (!cancelled) {
        setPremium(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!premium) return null;

  return (
    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
      ⭐ Premium
    </span>
  );
}
