// Outgoing-request timeouts (app/lib/httpTimeout.ts) against a real local
// HTTP server - no PayPal or Supabase involved.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchTextWithTimeout, RequestTimeoutError, OUTGOING_TIMEOUT_MS } from "../app/lib/httpTimeout.ts";

const open = new Set();
const server = createServer((req, res) => {
  open.add(res);
  if (req.url === "/ok") {
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
  } else if (req.url === "/error") {
    res.writeHead(503).end("<html>Service Unavailable</html>");
  } else if (req.url === "/stall-body") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"partial":'); // headers sent, body never finishes
  }
  // "/hang": never responds at all
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => {
  for (const res of open) res.destroy();
  server.close();
});

test("default deadline is about 8 seconds", () => {
  assert.equal(OUTGOING_TIMEOUT_MS, 8000);
});

test("fast response: returns status and body", async () => {
  const r = await fetchTextWithTimeout(`${base}/ok`, {}, "test GET /ok", 2000);
  assert.deepEqual(r, { ok: true, status: 200, text: '{"ok":true}' });
});

test("error status is returned, not thrown (caller decides)", async () => {
  const r = await fetchTextWithTimeout(`${base}/error`, {}, "test GET /error", 2000);
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test("server never responds: RequestTimeoutError naming the call", async () => {
  const started = Date.now();
  await assert.rejects(() => fetchTextWithTimeout(`${base}/hang`, {}, "PayPal GET /v1/x", 150), (error) => {
    assert.ok(error instanceof RequestTimeoutError);
    assert.equal(error.message, "PayPal GET /v1/x timed out after 150 ms");
    return true;
  });
  assert.ok(Date.now() - started < 2000);
});

test("headers sent but body stalls: same deadline covers reading the body", async () => {
  await assert.rejects(() => fetchTextWithTimeout(`${base}/stall-body`, {}, "PayPal POST /v1/y", 150), RequestTimeoutError);
});

test("non-timeout network failures are passed through unchanged", async () => {
  await assert.rejects(
    () => fetchTextWithTimeout("http://127.0.0.1:1/", {}, "closed port", 2000),
    (error) => !(error instanceof RequestTimeoutError)
  );
});
