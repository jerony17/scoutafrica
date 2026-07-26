import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  BASE_CURRENCY,
  PLAN_LABELS,
  getAmountForCycle,
  toStripeAmount,
  type BillingCycle,
  type SupportedCurrency,
} from "../../../lib/pricing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const VALID_CYCLES: BillingCycle[] = ["monthly", "annual"];
const VALID_CURRENCIES: SupportedCurrency[] = ["JPY", "NGN", "USD", "GBP", "EUR"];

// Card, Apple Pay, and Google Pay all go through this SAME endpoint -
// Stripe Checkout itself automatically shows Apple Pay / Google Pay as
// options within the same payment element when the customer's browser/
// device supports them; there's no separate "Apple Pay checkout" to
// build. This keeps the unified-payment-page requirement genuinely true
// rather than faking three code paths that all do the same thing.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cycle = body.cycle as BillingCycle;
    const currency = (body.currency as SupportedCurrency) || BASE_CURRENCY;

    if (!VALID_CYCLES.includes(cycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }
    if (!VALID_CURRENCIES.includes(currency)) {
      return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {
            // No-op: this route only reads the session to identify the
            // caller, it never needs to refresh/write auth cookies.
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

    const amount = getAmountForCycle(currency, cycle);
    const stripeAmount = toStripeAmount(amount, currency);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `ScoutAfrica ${PLAN_LABELS[cycle]}`,
            },
            unit_amount: stripeAmount,
            recurring: {
              interval: cycle === "monthly" ? "month" : "year",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        billing_cycle: cycle,
        currency,
        amount: String(amount),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          billing_cycle: cycle,
          currency,
          amount: String(amount),
        },
      },
      success_url: `${siteUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/payment/cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout session error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
