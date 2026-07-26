import "server-only";
import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. The "server-only" import above makes Next.js throw a
// build error if this file is ever imported from a Client Component,
// as a safety net against accidentally shipping the service role key to
// the browser. This client bypasses RLS entirely - only use it in API
// routes (app/api/**/route.ts) after verifying a real payment/webhook
// signature, never in response to an unauthenticated or unverified
// request.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
