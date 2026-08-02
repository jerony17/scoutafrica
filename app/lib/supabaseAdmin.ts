import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key - this
// deliberately bypasses RLS, so it must never run in the browser.
// Guarded with a plain runtime check rather than the `server-only`
// package, since that package's presence as an installed dependency
// couldn't be verified from this environment - this achieves the same
// protection without depending on something unconfirmed.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY - supabaseAdmin cannot be created."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});