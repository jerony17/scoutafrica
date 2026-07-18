import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Uses @supabase/ssr's browser client (not @supabase/supabase-js's createClient)
// so the auth session is stored in cookies rather than only localStorage. This is
// required for middleware.ts to be able to read the session server-side for route
// guards. The exported `supabase` client's API surface is unchanged.
export const supabase = createBrowserClient(
  supabaseUrl,
  supabaseAnonKey
);