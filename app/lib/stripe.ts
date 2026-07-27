import Stripe from "stripe";

// Guarded at module load time - the non-null assertion (!) that used to
// be here only satisfied TypeScript, it did nothing at runtime. If
// STRIPE_SECRET_KEY is missing, this now fails with a clear message
// instead of the Stripe SDK throwing an opaque error that your route's
// own try/catch can't even reach (module-level code runs before any
// function body, including try/catch blocks inside it).
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add it to .env.local and restart the dev server."
  );
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30.basil",
});
