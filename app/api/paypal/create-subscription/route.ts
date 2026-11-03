import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { checkRateLimit } from "../../../lib/rateLimit";
import { getEffectiveSubscriptionStatus, type BillingCycle, type SubscriptionStatus } from "../../../lib/pricing";
import {
  PAYPAL_CURRENCY,
  PayPalApiError,
  PayPalUnavailableError,
  createSubscription,
  getPayPalConfig,
  isPayPalCheckoutEnabled,
} from "../../../lib/paypal";
import { conflictingSubscription } from "../../../lib/paypalBilling";

const VALID_CYCLES: BillingCycle[] = ["monthly", "annual"];

// Starts a PayPal subscription and returns PayPal's approval URL for the
// browser to redirect to - same contract as the Stripe/Paystack routes
// ({ url }), so /upgrade handles it identically.
//
// This route grants NOTHING and writes nothing to the database. The
// user's ScoutAfrica id travels to PayPal as custom_id, and Premium is
// only granted later by app/api/paypal/webhook once a signed PayPal
// payment event has been verified against PayPal's own records.
export async function POST(request: NextRequest) {
  let config;
  try {
    config = getPayPalConfig();
  } catch (error) {
    if (error instanceof PayPalUnavailableError) {
      console.warn("PayPal checkout refused:", error.message);
      return NextResponse.json({ error: "PayPal is not available." }, { status: 503 });
    }
    throw error;
  }

  if (!isPayPalCheckoutEnabled()) {
    console.warn("PayPal checkout refused: PAYPAL_CHECKOUT_ENABLED is not 'true'.");
    return NextResponse.json({ error: "PayPal is not available." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const cycle = body.cycle as BillingCycle;
    const currency = body.currency ?? PAYPAL_CURRENCY;

    if (!VALID_CYCLES.includes(cycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }
    // PayPal plans carry exactly one currency each; ScoutAfrica's PayPal
    // plans are USD, priced to match PRICE_POINTS.USD in lib/pricing.ts.
    if (currency !== PAYPAL_CURRENCY) {
      return NextResponse.json({ error: "PayPal is only available in USD." }, { status: 400 });
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

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Same placement as the Stripe route: after auth, before any call to
    // the payment provider.
    const rateLimit = await checkRateLimit("paypal_create_subscription", user.id, 60, 5);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    // Don't start a second paid subscription for someone who already has
    // Premium (from any provider) - that would double-bill them.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, expires_at, payment_provider")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError) {
      console.error("PayPal checkout: failed to read existing subscription:", existingError);
      return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
    }

    const effective = getEffectiveSubscriptionStatus(
      existing?.status as SubscriptionStatus | null | undefined,
      existing?.expires_at
    );
    if (effective === "premium" || effective === "renewing") {
      return NextResponse.json({ error: "You already have an active Premium membership." }, { status: 409 });
    }
    // A card/Paystack subscription whose renewal failed (past_due) is still
    // being retried by that provider - starting PayPal now could bill twice.
    if (conflictingSubscription(existing, null) === "other_provider") {
      return NextResponse.json(
        { error: "Your current subscription has an unpaid renewal. Please contact support before switching to PayPal." },
        { status: 409 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;

    const subscription = await createSubscription(config, {
      planId: config.planIds[cycle],
      userId: user.id,
      returnUrl: `${siteUrl}/payment/success?provider=paypal`,
      cancelUrl: `${siteUrl}/payment/cancelled`,
      requestId: randomUUID(),
    });

    const approveUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
    if (!approveUrl) {
      console.error(`PayPal subscription ${subscription.id} returned no approve link`);
      return NextResponse.json({ error: "Failed to start PayPal checkout" }, { status: 502 });
    }

    return NextResponse.json({ url: approveUrl });
  } catch (error) {
    if (error instanceof PayPalApiError) {
      console.error("PayPal create subscription failed:", error.message, error.status, error.issue);
      return NextResponse.json({ error: "Failed to start PayPal checkout" }, { status: 502 });
    }
    console.error("PayPal create subscription error:", error);
    return NextResponse.json({ error: "Failed to start PayPal checkout" }, { status: 500 });
  }
}
