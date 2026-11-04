// Outgoing-request timeouts for the PayPal integration - no runtime imports,
// so the timeout behaviour is unit-tested against a real local server
// (tests/httpTimeout.test.mjs).
//
// PayPal does not document how long it waits for a webhook response, and
// redelivers anything that is not a 2xx. A hung PayPal or Supabase call
// would otherwise keep the function running up to the platform limit
// (300 s) while PayPal gives up and redelivers in parallel. Failing fast
// instead turns a stuck call into an ordinary retryable error (the webhook
// answers 500 and PayPal redelivers); every webhook write is idempotent.

export const OUTGOING_TIMEOUT_MS = 8000;

// The request may or may not have reached the other side - callers must
// treat the outcome as unknown, never as "did not happen".
export class RequestTimeoutError extends Error {}

function isAbort(error: unknown): boolean {
  const name = typeof error === "object" && error !== null && "name" in error ? error.name : null;
  return name === "TimeoutError" || name === "AbortError";
}

// fetch + reading the whole body, both bounded by ONE deadline (a server
// that sends headers and then stalls is caught too).
export async function fetchTextWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = OUTGOING_TIMEOUT_MS
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    if (isAbort(error)) {
      throw new RequestTimeoutError(`${label} timed out after ${timeoutMs} ms`);
    }
    throw error;
  }
}
