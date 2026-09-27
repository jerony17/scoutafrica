import "server-only";
import { createHash } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";

// Thin wrapper around the check_rate_limit() Postgres function (see
// supabase/migrations/047_rate_limits.sql) - that function is the actual
// enforcement mechanism (atomic, shared across serverless instances);
// this file only builds the key and shapes the result. Deliberately
// narrow: three call sites (support tickets, Paystack init, Stripe
// checkout init), not a general-purpose framework.

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

// Identifiers (IP addresses, user ids) are hashed before they ever
// become part of the stored `key` - the rate_limits table should hold
// the minimum needed to enforce a count per identifier per window, not
// a readable record of who made which request.
function hashIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

// bucket namesspaces the three call sites from each other (e.g. a
// Stripe-checkout limit and a Paystack-init limit for the same user
// must never share a counter). identifier is the raw, pre-hash value -
// an IP string or a Supabase auth user id.
export async function checkRateLimit(
  bucket: string,
  identifier: string,
  windowSeconds: number,
  maxCount: number
): Promise<RateLimitResult> {
  const key = `${bucket}:${hashIdentifier(identifier)}`;

  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_count: maxCount,
  });

  if (error || !data || data.length === 0) {
    // Fail OPEN, not closed: this is an additive abuse-prevention layer
    // on top of endpoints that otherwise work correctly (payment
    // checkout, support requests) - a transient database error here
    // should not itself take those flows down for every legitimate user.
    // Logged so a real outage is visible, not silently swallowed.
    console.error("[rateLimit] check_rate_limit RPC failed, allowing request:", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const row = data[0] as { allowed: boolean; retry_after_seconds: number };
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
}

// Vercel's edge network sets x-forwarded-for with the true connecting
// client's IP as the FIRST entry (any subsequent hops, if present, are
// appended after it) - this is Vercel's documented forwarding behavior,
// not an assumption. Only that first entry is used; the rest of the
// header is discarded, and nothing from the request is logged or stored
// beyond the (hashed, see above) IP itself.
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}
