import { Suspense } from "react";
import VerificationsClient from "./VerificationsClient";

// Server Component receiving the tab selection as a prop, per the pattern
// already established for /express-interest in this project - avoids the
// useSearchParams-without-Suspense build error hit earlier this session.
export default function VerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          Loading...
        </main>
      }
    >
      <VerificationsClient searchParams={searchParams} />
    </Suspense>
  );
}
