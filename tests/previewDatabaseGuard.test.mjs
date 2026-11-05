// Preview database guard in next.config.ts: Vercel Preview builds must use
// the test Supabase project only. Each case loads the real next.config.ts in
// a fresh Node process with a controlled environment (no inherited Supabase
// or Vercel variables), exactly as a build would load it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const TEST_URL = "https://gdoadajmggmawiiyoaus.supabase.co";
const PRODUCTION_URL = "https://dbleskorympnnhekbkgo.supabase.co";
const MARKER_KEY = "SECRET-MARKER-must-never-be-printed";

function loadConfig(env) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./next.config.ts')"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SUPABASE_SERVICE_ROLE_KEY: MARKER_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: MARKER_KEY,
      ...env,
    },
  });
  const output = `${r.stdout}\n${r.stderr}`;
  assert.ok(!output.includes(MARKER_KEY), "no key may ever be printed");
  return { ok: r.status === 0, output };
}

function assertRefused(env, reason) {
  const { ok, output } = loadConfig({ VERCEL_ENV: "preview", ...env });
  assert.equal(ok, false, `expected the Preview build to be refused (${reason})`);
  assert.match(output, /Preview build refused: NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(output, reason);
  assert.doesNotMatch(output, /verified \(test project\)/);
}

test("Preview + test project: accepted, logs only the verified project reference", () => {
  const { ok, output } = loadConfig({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: TEST_URL });
  assert.equal(ok, true, output);
  assert.match(output, /Preview build: Supabase project gdoadajmggmawiiyoaus verified \(test project\)\./);
  assert.ok(!output.includes("https://"), "the URL itself is not printed");
});

test("Preview + test project with a trailing slash: accepted", () => {
  assert.equal(loadConfig({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/` }).ok, true);
});

test("Preview + Production project: refused", () => {
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL }, /points to the Production project/);
  assert.ok(!loadConfig({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL }).output.includes(PRODUCTION_URL));
});

test("Preview + any other Supabase project: refused", () => {
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: "https://hmoaenxdgxuuxrtodqap.supabase.co" }, /is not the test project/);
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }, /is not the test project/);
});

test("Preview + missing URL: refused", () => {
  assertRefused({}, /is not set/);
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: "" }, /is not set/);
});

test("Preview + malformed URL: refused", () => {
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }, /is not a valid URL/);
  assertRefused({ NEXT_PUBLIC_SUPABASE_URL: "gdoadajmggmawiiyoaus.supabase.co" }, /is not a valid URL/);
});

test("Preview + look-alikes of the test project: refused", () => {
  for (const url of [
    "http://gdoadajmggmawiiyoaus.supabase.co",
    "https://gdoadajmggmawiiyoaus.supabase.co:8443",
    "https://gdoadajmggmawiiyoaus.supabase.co.evil.example",
    "https://evil.example/gdoadajmggmawiiyoaus.supabase.co",
    "https://gdoadajmggmawiiyoaus.supabase.co@evil.example",
    "https://user:pass@gdoadajmggmawiiyoaus.supabase.co",
    "https://gdoadajmggmawiiyoaus.supabase.co/rest/v1",
    "https://gdoadajmggmawiiyoaus.supabase.co/?x=1",
    "https://xgdoadajmggmawiiyoaus.supabase.co",
  ]) {
    assertRefused({ NEXT_PUBLIC_SUPABASE_URL: url }, /is not the test project/);
  }
});

test("Production builds are unaffected", () => {
  const { ok, output } = loadConfig({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert.equal(ok, true, output);
  assert.doesNotMatch(output, /Preview build/);
});

test("Local builds and development (no VERCEL_ENV) are unaffected", () => {
  for (const env of [{ NEXT_PUBLIC_SUPABASE_URL: TEST_URL }, { NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL }, {}]) {
    const { ok, output } = loadConfig(env);
    assert.equal(ok, true, output);
    assert.doesNotMatch(output, /Preview build/);
  }
});

test("Vercel development environment is unaffected", () => {
  const { ok, output } = loadConfig({ VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  assert.equal(ok, true, output);
  assert.doesNotMatch(output, /Preview build/);
});
