import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  BASE_CURRENCY,
  getAmountForCycle,
  getEffectiveSubscriptionStatus,
  toPaystackAmount,
  type BillingCycle,
  type SubscriptionStatus,
  type SupportedCurrency,
} from "../../../lib/pricing";
import { checkRateLimit } from "../../../lib/rateLimit";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

// Paystack settles in a limited set of currencies (NGN, GHS, ZAR, KES,
// USD as of this writing) - verify your Paystack account's enabled
// currencies before launch. Unsupported currencies are rejected with a
// 400 below rather than silently substituted with USD.
const PAYSTACK_SUPPORTED: SupportedCurrency[] = ["NGN", "USD"];

const VALID_CYCLES: BillingCycle[] = ["monthly", "annual"];

const PLAN_CODES: Record<BillingCycle, string | undefined> = {
  monthly: process.env.PAYSTACK_PLAN_CODE_MONTHLY,
  annual: process.env.PAYSTACK_PLAN_CODE_ANNUAL,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cycle = body.cycle as BillingCycle;
    const currency = (body.currency as SupportedCurrency) || BASE_CURRENCY;

    if (!VALID_CYCLES.includes(cycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }

    if (!PAYSTACK_SUPPORTED.includes(currency)) {
      return NextResponse.json(
        { error: "Paystack only supports NGN and USD for this payment flow. Please choose a different payment method or currency." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {
            // No-op: read-only session check.
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Rate limit AFTER auth (needs the real authenticated user id as the
    // identifier) and BEFORE calling the Paystack API - a rejected
    // request must never reach Paystack.
    const rateLimit = await checkRateLimit("paystack_initialize", user.id, 60, 5);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    // Don't start a second paid subscription on top of active Premium from
    // any provider: the existing one keeps billing on its own, and this
    // checkout's charge.success would overwrite that subscription's record
    // (e.g. a live PayPal one). Users without active Premium reach Paystack
    // exactly as before. If the lookup fails, no NEW checkout is started
    // (temporary 503, the customer can retry).
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("Paystack initialize: could not check for an existing subscription:", existingError);
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again in a moment." },
        { status: 503 }
      );
    }
    if (existing) {
      const effective = getEffectiveSubscriptionStatus(existing.status as SubscriptionStatus, existing.expires_at);
      if (effective === "premium" || effective === "renewing") {
        return NextResponse.json(
          { error: "You already have an active Premium membership." },
          { status: 409 }
        );
      }
    }

    const amount = getAmountForCycle(currency, cycle);
    const paystackAmount = toPaystackAmount(amount, currency);
    const planCode = PLAN_CODES[cycle];

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: paystackAmount,
        currency,
        callback_url: `${siteUrl}/payment/success?provider=paystack`,
        ...(planCode ? { plan: planCode } : {}),
        metadata: {
          user_id: user.id,
          billing_cycle: cycle,
          currency,
          amount,
        },
      }),
    });

    const data = await paystackResponse.json();

    if (!paystackResponse.ok || !data.status) {
      console.error("Paystack initialize error:", data);
      return NextResponse.json(
        { error: data.message || "Failed to initialize Paystack transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.data.authorization_url, reference: data.data.reference });
  } catch (error) {
    console.error("Paystack initialize route error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
