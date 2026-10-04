import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  type PaystackEvent,
  handleChargeSuccess,
  handleSubscriptionCreate,
  handleSubscriptionStatusChange,
  handlePaymentFailed,
} from "./handlers";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!;

// Paystack signs the RAW request body with HMAC-SHA512 using your secret
// key, sent as the x-paystack-signature header. This must be verified
// before trusting anything in the payload - exactly like Stripe's
// signature check, just a different algorithm.
//
// This file owns only signature verification and event dispatch. The actual
// per-event logic lives in handlers.ts, which Next.js's route-export
// contract (only GET/POST/etc. may be exported from a route file) would
// otherwise make impossible to unit test directly.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const expectedSignature = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.error("Paystack webhook signature mismatch");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(event, supabaseAdmin);
        break;
      case "subscription.create":
        await handleSubscriptionCreate(event, supabaseAdmin);
        break;
      case "subscription.disable":
      case "subscription.not_renew":
        await handleSubscriptionStatusChange(event, supabaseAdmin);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event, supabaseAdmin);
        break;
      default:
        // Unhandled event types are intentionally ignored, not errors.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Paystack webhook handler error:", err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
