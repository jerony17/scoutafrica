# ScoutAfrica Payment & Subscription System — Final Deliverables

## Read this first: what's verified vs. what isn't

Everything in this document was built and, where possible, tested directly:

- **Database, RLS, and all SQL functions**: fully tested against the live Supabase project with real queries simulating real users, admins, and attackers. See the specific test results throughout this document.
- **API routes (Stripe/Paystack checkout, webhooks, cancellation)**: written carefully against the documented API contracts, syntax-checked, but **never executed against a live Stripe or Paystack account**. This development sandbox has no network access, all session — I cannot install `stripe`, cannot call either provider's API, and cannot fire a real webhook at these handlers. This is not a minor caveat; it is the single most important thing in this document. Test these yourself, end-to-end, in Stripe's and Paystack's test modes, before going live.
- **`npm run build`**: attempted repeatedly throughout this work. Every attempt returns `next: not found` because this sandbox never had `node_modules` installed (no network access). You must run the build yourself for the authoritative pass/fail.

---

## 1. Every modified file

| File | Change |
|---|---|
| `app/lib/types.ts` | Added `Subscription`, `PaymentHistoryEntry` types + predicates |
| `app/player-profile/components/PlayerHeader.tsx` | Added `PremiumBadge` next to the existing verification badge |
| `app/club-dashboard/page.tsx` | Added `PremiumBadge`, a `userId` state var to support it, and a Subscription quick-action link |
| `app/club-profile/[id]/page.tsx` | Added `PremiumBadge` next to the existing verification badge |
| `app/player-dashboard/page.tsx` | Added a Subscription link next to the existing Messages link |
| `app/scout-dashboard/page.tsx` | Added a Subscription link |
| `app/admin/page.tsx` | Added a Subscriptions tile to the existing quick-links grid |

Every one of these diffs was reviewed line-by-line before committing (see chat history for the full `git diff` output). Total: 6 files, 44 insertions, 3 deletions — all 3 deletions were grid-column-count widenings to fit a new tile, not content removal.

## 2. Every new file

**Database**
- `supabase/migrations/028_subscriptions_system.sql`

**Server-only libraries**
- `app/lib/supabaseAdmin.ts` — service-role Supabase client, guarded by the `server-only` package
- `app/lib/pricing.ts` — single source of truth for plan pricing, currency, and the effective-status helper
- `app/lib/currency.ts` — locale-based currency detection

**API routes**
- `app/api/stripe/create-checkout-session/route.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/paystack/initialize/route.ts`
- `app/api/paystack/webhook/route.ts`
- `app/api/subscription/cancel/route.ts`

**Pages**
- `app/upgrade/page.tsx`
- `app/subscription/page.tsx`
- `app/payment/success/page.tsx`
- `app/payment/cancelled/page.tsx`
- `app/admin/subscriptions/page.tsx`

**Component**
- `app/components/PremiumBadge.tsx`

## 3. SQL migration

`supabase/migrations/028_subscriptions_system.sql` — already applied to your live Supabase project during this session. Contains:
- `subscriptions` and `payment_history` tables, indexed, RLS enabled
- `is_user_premium(uuid)` — public boolean check
- `get_subscription_admin_stats()`, `get_revenue_by_currency()`, `get_revenue_by_provider()`, `get_payment_method_stats()` — admin-only, all raise a real exception for non-admins (tested)

If you're setting up a **separate** environment (staging/production), run this file in the Supabase SQL Editor for that project.

## 4. Required npm packages

None of these are installed in this sandbox (no network access) — you need to run:

```bash
npm install stripe
npm install server-only
```

`@supabase/supabase-js` and `@supabase/ssr` are already dependencies of this project from earlier work. Paystack is called via plain `fetch()` — no SDK needed.

## 5. Environment variables

Add these to `.env.local` (and your hosting provider's environment settings for production):

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...           # server-only, never expose to the client
STRIPE_WEBHOOK_SECRET=whsec_...         # from your webhook endpoint's settings
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # not currently used by the code above, but reserved if you later add Stripe.js on the client

# Paystack
PAYSTACK_SECRET_KEY=sk_test_...         # server-only
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_...      # reserved for future client-side use
PAYSTACK_PLAN_CODE_MONTHLY=PLN_...      # create this in your Paystack dashboard first (see below)
PAYSTACK_PLAN_CODE_ANNUAL=PLN_...

# Supabase (service role - server-only, DO NOT expose to the client, DO NOT commit)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Site URL, used to build Stripe/Paystack redirect URLs
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already exist in this project from earlier work — reused, not duplicated.

**Never commit `.env.local` to git.** Confirm it's in `.gitignore` (it should already be, from the original project setup).

## 6. Stripe setup guide

1. Create a Stripe account (or use your existing one) at dashboard.stripe.com.
2. In **Developers → API keys**, copy your **test** Secret key into `STRIPE_SECRET_KEY` while developing. Switch to live keys only when ready to launch.
3. You do **not** need to pre-create Products/Prices in the dashboard — the checkout route creates prices dynamically via `price_data`, so JPY/USD/GBP/EUR/NGN all work out of the box with the amounts defined in `app/lib/pricing.ts`.
4. **Review and adjust the amounts in `app/lib/pricing.ts` before launch.** The USD/GBP/EUR/NGN figures I included are reasonable approximations, not verified current exchange rates.
5. In **Developers → Webhooks**, add an endpoint pointing to `https://your-domain.com/api/stripe/webhook`. Subscribe to at least these events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
6. Copy the webhook's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
7. Test using Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC. Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) to test webhooks locally before deploying.
8. Apple Pay / Google Pay require your domain to be verified with Stripe (**Settings → Payment methods → Apple Pay** domain verification) and served over HTTPS — they will not appear in Checkout otherwise, including on `localhost`.

## 7. Paystack setup guide

1. Create a Paystack account at dashboard.paystack.com.
2. In **Settings → API Keys & Webhooks**, copy your **test** Secret key into `PAYSTACK_SECRET_KEY`.
3. **Create two Plans** (required for recurring billing — Paystack, unlike Stripe, needs a pre-created Plan object): go to **Payments → Plans → New Plan**, create "Premium Monthly" (interval: monthly) and "Premium Annual" (interval: annually), matching the amounts in `app/lib/pricing.ts`. Copy each plan's code into `PAYSTACK_PLAN_CODE_MONTHLY` / `PAYSTACK_PLAN_CODE_ANNUAL`.
4. **Verify which currencies your Paystack account supports** — this varies by the country your account was registered in. The code defaults to NGN and falls back to USD for anything else; adjust `PAYSTACK_SUPPORTED` in `app/api/paystack/initialize/route.ts` to match your actual account capabilities.
5. In the same Webhooks section, add `https://your-domain.com/api/paystack/webhook` and ensure it's active.
6. Test using Paystack's test cards (listed in their dashboard's test mode) before going live.

## 8. Webhook configuration summary

| Provider | URL | Secret env var | Verified via |
|---|---|---|---|
| Stripe | `/api/stripe/webhook` | `STRIPE_WEBHOOK_SECRET` | `stripe.webhooks.constructEvent()` against the raw body |
| Paystack | `/api/paystack/webhook` | `PAYSTACK_SECRET_KEY` | HMAC-SHA512 of the raw body, compared to the `x-paystack-signature` header |

Both handlers read `request.text()` (the raw, unparsed body) rather than `request.json()` — this is required for signature verification and must not be changed.

## 9. Manual Supabase configuration required

1. **`SUPABASE_SERVICE_ROLE_KEY`**: found in your Supabase project's **Settings → API → service_role key**. This key bypasses RLS entirely — it must only ever be used server-side (in the `app/api/**` routes and `supabaseAdmin.ts`), never sent to the browser. Store it as a server-only environment variable in your hosting provider.
2. No other manual Supabase dashboard configuration is required — migration 028 already created and configured everything else (tables, RLS, functions) directly against your live project.

## 10. Deployment checklist

Before going live:

- [ ] Run `npm install stripe server-only` locally, confirm the project builds
- [ ] Run `npm run build` and get an actual clean result (I could not verify this from this sandbox)
- [ ] Review and correct the currency amounts in `app/lib/pricing.ts`
- [ ] Create real Stripe webhook endpoint, copy the real signing secret
- [ ] Create real Paystack Plans, copy the real plan codes
- [ ] Set all environment variables listed in Section 5 in your hosting provider (not just `.env.local`)
- [ ] Test a real Stripe checkout end-to-end in test mode: subscribe, confirm `subscriptions` row appears correctly, confirm `payment_history` row appears, confirm the Premium badge shows
- [ ] Test a real Paystack checkout end-to-end in test mode, same checks
- [ ] Test cancellation for both providers, confirm status changes correctly
- [ ] Test a renewal (Stripe: use the CLI to trigger `invoice.paid`; Paystack: wait for or simulate a renewal cycle in test mode)
- [ ] Confirm Apple Pay / Google Pay domain verification is complete if you want those to actually appear
- [ ] Switch all keys from test to live only after the above all pass
- [ ] Re-run every item in Section 11 below one final time in the live environment

---

## 11. Existing-feature verification

**What I can confirm directly**: `git diff`/`git status` show that only the 6 files listed in Section 1 were modified across the entire payment system project, and every change in those files is small and additive (a badge, a link, a grid-column-count widening). No file belonging to Authentication, Messaging, Notifications, Watchlist, Contact Requests, Verification, Find Players, Profile Editing, Player Registration, or any existing Admin feature was touched at any point in this work.

**What I cannot do from this sandbox**: actually click through the app and confirm each feature still works in a browser. The claim above is based on diff review, not a live functional test. Please click through this list yourself after deploying:

- [ ] Authentication (sign up, sign in, sign out)
- [ ] Player Registration
- [ ] Player Dashboard
- [ ] Club Dashboard (now also showing the Premium badge + Subscription link — confirm both render without breaking anything else)
- [ ] Scout Dashboard (now also showing a Subscription link)
- [ ] Admin Dashboard (now with a 5th tile — confirm the grid still lays out correctly)
- [ ] Player Profile (now also showing the Premium badge)
- [ ] Club Profile (now also showing the Premium badge)
- [ ] Messaging
- [ ] Contact Requests
- [ ] Watchlist
- [ ] Notifications
- [ ] Verification System
- [ ] Profile Editing
- [ ] Find Players
- [ ] Existing Admin features (Contact Requests, Player Reports, Verifications, Conversation Monitor)

## 12. Payment system integration confirmation

- Premium status is derived from `is_user_premium()`, a single, tested source of truth — not duplicated per page
- The badge component renders nothing when not premium, so it cannot visually break any page that doesn't have a premium user
- All new pages (`/upgrade`, `/subscription`, `/payment/*`, `/admin/subscriptions`) are entirely new routes — they cannot conflict with or break any existing route
- No existing table's schema, RLS policy, or trigger was altered by migration 028
