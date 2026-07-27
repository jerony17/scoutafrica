import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { stripe } from "@/app/lib/stripe";

export async function GET() {
  return POST();
}

// MINIMAL CHANGE from your original file: this now (1) authenticates the
// request and (2) sets client_reference_id on the checkout session. Both
// are required for the webhook to know WHICH ScoutAfrica user just paid -
// without them, checkout.session.completed has no way to identify the
// user at all. Nothing else about this route was changed.
export async function POST() {
  try {
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: user.email,
      client_reference_id: user.id, // <-- the webhook reads this
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "ScoutAfrica Premium Membership",
            },
            unit_amount: 500,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Unable to create checkout session",
      },
      {
        status: 500,
      }
    );
  }
}
