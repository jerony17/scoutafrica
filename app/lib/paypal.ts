import "server-only";
import type { PayPalBillingCycle, PayPalTransaction } from "./paypalBilling";

// Server-only PayPal REST client (Subscriptions API v1 + webhook signature
// verification). Credentials are read from the environment only and never
// returned, logged, or sent to the browser.
//
// Every entry point calls getPayPalConfig(), which picks the API from
// PAYPAL_ENV and refuses to run unless the deployment matches it:
//   - "live":    ONLY a Vercel Production deployment (VERCEL_ENV=production)
//                connected to the production Supabase project.
//   - "sandbox": NEVER on Vercel Production and NEVER against the
//                production Supabase project (local dev, previews, the
//                test project).
//   - anything else (or unset): refused.
// and every PayPal credential/plan/webhook id must be configured. So a
// preview or local run can never take real money, and Sandbox events can
// never grant Premium in production data. Credentials, plan ids and the
// webhook id only exist in the environment they were created in, so a
// mismatched set fails at PayPal (auth/lookup errors) instead of working.
//
// Two separate switches, so turning off NEW sales never strands existing
// subscribers:
//   - getPayPalConfig() (above) gates everything: webhook processing,
//     cancellation, and checkout. Configured = on.
//   - isPayPalCheckoutEnabled() gates ONLY starting new subscriptions.
//     Setting PAYPAL_CHECKOUT_ENABLED to anything but "true" stops new
//     sign-ups while renewals, cancellations and refunds keep processing.

const API_BASES = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

type PayPalEnv = keyof typeof API_BASES;

// Production Supabase project ref (the same one next.config.ts's CSP
// already names). Only Live payments may write to it.
const PRODUCTION_SUPABASE_REF = "dbleskorympnnhekbkgo";

export const PAYPAL_CURRENCY = "USD" as const;

export class PayPalUnavailableError extends Error {}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issue: string | null
  ) {
    super(message);
  }
}

interface PayPalConfig {
  env: PayPalEnv;
  apiBase: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  planIds: Record<PayPalBillingCycle, string>;
}

// New-subscription kill switch only (off by default). Never checked by the
// webhook or the cancel route.
export function isPayPalCheckoutEnabled(): boolean {
  return process.env.PAYPAL_CHECKOUT_ENABLED === "true";
}

function isProductionSupabase(): boolean {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").hostname === `${PRODUCTION_SUPABASE_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export function getPayPalConfig(): PayPalConfig {
  const env = process.env.PAYPAL_ENV;
  const isProductionDeployment = process.env.VERCEL_ENV === "production";

  if (env === "live") {
    if (!isProductionDeployment) {
      throw new PayPalUnavailableError("PayPal Live is only allowed on the production deployment.");
    }
    if (!isProductionSupabase()) {
      throw new PayPalUnavailableError("PayPal Live is only allowed against the production Supabase project.");
    }
  } else if (env === "sandbox") {
    if (isProductionDeployment) {
      throw new PayPalUnavailableError("PayPal Sandbox is refused on the production deployment.");
    }
    // Substring, not exact host: refuse anything that even mentions the
    // production project.
    if ((process.env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PRODUCTION_SUPABASE_REF)) {
      throw new PayPalUnavailableError("PayPal Sandbox is refused against the production Supabase project.");
    }
  } else {
    throw new PayPalUnavailableError('PAYPAL_ENV must be "sandbox" or "live".');
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const monthly = process.env.PAYPAL_PLAN_ID_MONTHLY;
  const annual = process.env.PAYPAL_PLAN_ID_ANNUAL;

  if (!clientId || !clientSecret || !webhookId || !monthly || !annual) {
    // Names only - never values.
    throw new PayPalUnavailableError(
      "Missing PayPal configuration: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, " +
        "PAYPAL_PLAN_ID_MONTHLY and PAYPAL_PLAN_ID_ANNUAL are all required."
    );
  }

  return {
    env,
    apiBase: API_BASES[env],
    clientId,
    clientSecret,
    webhookId,
    planIds: { monthly, annual },
  };
}

export function cycleForPlanId(config: PayPalConfig, planId: string | undefined): PayPalBillingCycle | null {
  if (planId === config.planIds.monthly) return "monthly";
  if (planId === config.planIds.annual) return "annual";
  return null;
}

// OAuth 2.0 client-credentials token, cached per server instance until
// shortly before PayPal's expires_in. Tied to the API host and client id
// it was issued for, so a token is never sent to the other environment.
let cachedToken: { value: string; expiresAt: number; apiBase: string; clientId: string } | null = null;

async function getAccessToken(config: PayPalConfig): Promise<string> {
  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now() &&
    cachedToken.apiBase === config.apiBase &&
    cachedToken.clientId === config.clientId
  ) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new PayPalApiError("PayPal authentication failed", response.status, null);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new PayPalApiError("PayPal authentication returned no token", response.status, null);
  }

  const lifetimeMs = Math.max(0, (data.expires_in ?? 0) - 60) * 1000;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + lifetimeMs,
    apiBase: config.apiBase,
    clientId: config.clientId,
  };
  return data.access_token;
}

async function paypalRequest<T>(
  config: PayPalConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: string; headers?: Record<string, string> }
): Promise<{ status: number; data: T | null }> {
  const token = await getAccessToken(config);
  const response = await fetch(`${config.apiBase}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: init.body,
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : null;

  if (!response.ok) {
    // PayPal error bodies carry a name/issue code, never our credentials.
    const issue =
      (data as { details?: { issue?: string }[]; name?: string } | null)?.details?.[0]?.issue ??
      (data as { name?: string } | null)?.name ??
      null;
    throw new PayPalApiError(`PayPal ${init.method} ${path.split("?")[0]} failed`, response.status, issue);
  }

  return { status: response.status, data };
}

export interface PayPalSubscription {
  id: string;
  status: string;
  plan_id?: string;
  custom_id?: string;
  links?: { href: string; rel: string; method?: string }[];
}

export async function createSubscription(
  config: PayPalConfig,
  params: { planId: string; userId: string; returnUrl: string; cancelUrl: string; requestId: string }
): Promise<PayPalSubscription> {
  const { data } = await paypalRequest<PayPalSubscription>(config, "/v1/billing/subscriptions", {
    method: "POST",
    headers: { "PayPal-Request-Id": params.requestId, Prefer: "return=minimal" },
    body: JSON.stringify({
      plan_id: params.planId,
      custom_id: params.userId,
      // application_context is marked deprecated in PayPal's current schema
      // but is still what its published subscription guides use for the
      // redirect flow; confirm behaviour in Sandbox before go-live.
      application_context: {
        brand_name: "ScoutAfrica",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  if (!data?.id) {
    throw new PayPalApiError("PayPal create subscription returned no id", 502, null);
  }
  return data;
}

export async function getSubscription(config: PayPalConfig, subscriptionId: string): Promise<PayPalSubscription> {
  const { data } = await paypalRequest<PayPalSubscription>(
    config,
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" }
  );
  if (!data?.id) {
    throw new PayPalApiError("PayPal subscription lookup returned no id", 502, null);
  }
  return data;
}

export async function listSubscriptionTransactions(
  config: PayPalConfig,
  subscriptionId: string,
  start: Date,
  end: Date
): Promise<PayPalTransaction[]> {
  const query = new URLSearchParams({
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });
  const { data } = await paypalRequest<{ transactions?: PayPalTransaction[] }>(
    config,
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions?${query}`,
    { method: "GET" }
  );
  return data?.transactions ?? [];
}

export async function cancelSubscription(config: PayPalConfig, subscriptionId: string, reason: string): Promise<void> {
  await paypalRequest<null>(config, `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.slice(0, 128) }),
  });
}

// Asks PayPal to verify a received webhook. The event is passed back
// byte-for-byte as received (spliced in as raw JSON, not re-serialized),
// so no parse/stringify round-trip can alter what PayPal checks.
export async function verifyWebhookSignature(
  config: PayPalConfig,
  headers: Headers,
  rawBody: string
): Promise<boolean> {
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };

  if (Object.values(fields).some((v) => !v)) {
    return false;
  }

  const body =
    `{"auth_algo":${JSON.stringify(fields.auth_algo)},` +
    `"cert_url":${JSON.stringify(fields.cert_url)},` +
    `"transmission_id":${JSON.stringify(fields.transmission_id)},` +
    `"transmission_sig":${JSON.stringify(fields.transmission_sig)},` +
    `"transmission_time":${JSON.stringify(fields.transmission_time)},` +
    `"webhook_id":${JSON.stringify(config.webhookId)},` +
    `"webhook_event":${rawBody}}`;

  const { data } = await paypalRequest<{ verification_status?: string }>(
    config,
    "/v1/notifications/verify-webhook-signature",
    { method: "POST", body }
  );

  return data?.verification_status === "SUCCESS";
}
