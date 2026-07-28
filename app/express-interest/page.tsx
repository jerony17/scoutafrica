import { Suspense } from "react";
import ExpressInterestClient from "./ExpressInterestClient";
import PremiumGuard from "../components/PremiumGuard";

// Server Component (no "use client"). Per Next.js's current official guidance
// for useSearchParams()-during-prerendering, searchParams is received here as
// an async prop and forwarded to a Client Component that unwraps it with
// React's use(). This is a different, more robust mechanism than calling
// useSearchParams() inside a client-only page - see ExpressInterestClient.tsx
// for why this replaced the previous single-file "use client" + useSearchParams
// + Suspense pattern, which kept failing Next.js 16's prerender check despite
// being structurally correct.
export default function ExpressInterestPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; type?: string }>;
}) {
  return (
    <PremiumGuard>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center">
            Loading...
          </main>
        }
      >
        <ExpressInterestClient searchParams={searchParams} />
      </Suspense>
    </PremiumGuard>
  );
}
