"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Separate from the existing verification badge by design - a user can
// be Verified, Premium, both, or neither. Renders nothing while loading
// or if not premium, so it never shifts layout or shows a false badge.
export default function PremiumBadge({ userId }: { userId: string | null | undefined }) {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    supabase
      .rpc("is_user_premium", { p_user_id: userId })
      .then(({ data }) => {
        if (!cancelled && data === true) {
          setIsPremium(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!isPremium) return null;

  return (
    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
      ⭐ Premium
    </span>
  );
}
