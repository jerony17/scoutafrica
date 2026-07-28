import { supabase } from "./supabase";

// The single source of truth for "is this user premium?" across the
// whole platform. Deliberately NOT a direct query against subscriptions -
// RLS on that table only allows a user to read their OWN row (tested,
// working as intended), so a direct query here could never check anyone
// else's status - which every badge/guard in this feature needs to do
// (another user's profile, another user's message, a search result).
// is_user_premium() already exists as a tested, SECURITY DEFINER RPC
// built exactly for this - reusing it here avoids a second, competing
// implementation of the expiry-check logic that could drift out of sync.
export async function isPremium(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase.rpc("is_user_premium", { p_user_id: userId });

  if (error) {
    console.error("isPremium() check failed:", error);
    return false; // fail closed - never grant premium access on an error
  }

  return data === true;
}
