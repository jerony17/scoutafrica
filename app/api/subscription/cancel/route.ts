import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

// The caller (the /subscription dashboard) does not need to know or care
// whether the underlying provider is Stripe or Paystack - this route
// looks up the user's own subscription, dispatches to the right
// provider's cancel API, and always ends up at the same DB update. "The
// subscription system must not care whether payment came from Stripe or
// Paystack" applies to cancellation too, not just activation.
export async function POST(request: NextRequest) {
  try {
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

    // Read the user's own subscription with the admin client (bypasses
    // RLS for the SELECT) after already verifying, above, that this is
    // genuinely their own session - not trusting a user_id from the
    // request body.
    const { data: subscription, error: fetchError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchError || !subscription) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    if (subscription.status !== "premium" && subscription.status !== "renewing") {
      return NextResponse.json({ error: "No active subscription to cancel" }, { status: 400 });
    }

    if (subscription.payment_provider === "stripe" && subscription.stripe_subscription_id) {
      await stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
      // The actual status flip to 'cancelled' happens via the
      // customer.subscription.deleted webhook once the current period
      // truly ends - this keeps the single source of truth in the
      // webhook handler, not duplicated here.
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "renewing", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
    } else if (subscription.payment_provider === "paystack" && subscription.paystack_subscription_code) {
      const detailResponse = await fetch(
        `https://api.paystack.co/subscription/${subscription.paystack_subscription_code}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
      );
      const detailData = await detailResponse.json();
      const emailToken = detailData?.data?.email_token;

      if (emailToken) {
        await fetch("https://api.paystack.co/subscription/disable", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: subscription.paystack_subscription_code,
            token: emailToken,
          }),
        });
      }

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", subscription.id);
    } else {
      return NextResponse.json(
        { error: "Subscription has no linked provider reference to cancel" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscription cancel error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
