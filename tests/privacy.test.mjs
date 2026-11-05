// Player contact privacy + registration gating (Phase 1, app side).
// The database-level column restriction is a separate migration; these
// tests make sure the app never asks for private player columns, so it
// keeps working once the database refuses them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PLAYER_PUBLIC_COLUMN_LIST, PLAYER_PRIVATE_COLUMNS, PLAYER_PUBLIC_COLUMNS } from "../app/lib/playerColumns.ts";
import { readPlayerPrivate } from "../app/lib/playerPrivate.ts";
import { REGISTER_PROMPT_MESSAGE, REGISTER_PATH } from "../app/lib/registration.ts";
import nextConfig from "../next.config.ts";

// public.player columns as they exist in production (2026-11-06).
const PLAYER_TABLE_COLUMNS = [
  "id", "created_at", "full_name", "age", "nationality", "position", "current_club", "slug", "photo_url",
  "email", "scoutafrica_id", "user_id", "height", "weight", "preferred_foot", "date_of_birth",
  "contract_expiry", "bio", "verified", "cover_photo_url", "matches", "goals", "assists", "minutes_played",
  "clean_sheets", "yellow_cards", "red_card", "playing_style", "strengths", "secondary_position",
  "languages_spoken", "availability_status",
];

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}
const APP_FILES = sourceFiles("app").map((path) => ({ path, text: readFileSync(path, "utf8") }));

// === Public column list ===

test("public player columns exclude email and date_of_birth", () => {
  for (const col of PLAYER_PRIVATE_COLUMNS) assert.ok(!PLAYER_PUBLIC_COLUMN_LIST.includes(col), `${col} must not be public`);
  assert.ok(!PLAYER_PUBLIC_COLUMNS.includes("*"));
  assert.ok(!/email|date_of_birth/.test(PLAYER_PUBLIC_COLUMNS));
});

test("public + private columns cover the whole player table exactly once", () => {
  const all = [...PLAYER_PUBLIC_COLUMN_LIST, ...PLAYER_PRIVATE_COLUMNS];
  assert.equal(new Set(all).size, all.length, "no duplicates");
  assert.deepEqual([...all].sort(), [...PLAYER_TABLE_COLUMNS].sort());
  assert.equal(PLAYER_PUBLIC_COLUMN_LIST.length, 30);
});

// === No app query can ask for private player columns ===

test("no player query selects * or a private column", () => {
  const offenders = [];
  for (const { path, text } of APP_FILES) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.includes('.from("player")')) return;
      const window = lines.slice(i, i + 4).join(" ");
      const select = window.match(/\.select\(\s*("[^"]*"|`[^`]*`|[A-Z_]+)/);
      if (!select) return;
      if (/"\*"|email|date_of_birth/.test(select[1])) offenders.push(`${path}:${i + 1} ${select[1]}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test("no embedded player select uses * (e.g. player:player_id(*))", () => {
  const offenders = APP_FILES.filter(({ text }) => /player(:[a-z_]+)?(![a-z_]+)?\(\s*\*\s*\)/.test(text)).map((f) => f.path);
  assert.deepEqual(offenders, []);
});

test("player writes do not read the row back (a full read-back would need private columns)", () => {
  const offenders = [];
  for (const { path, text } of APP_FILES) {
    const re = /\.from\("player"\)\s*\.(insert|update|upsert)\(/g;
    let m;
    while ((m = re.exec(text))) {
      // Up to the end of this statement.
      const stmt = text.slice(m.index, text.indexOf(";", m.index));
      if (/\.select\(\s*\)/.test(stmt) || /\.select\(\s*"\*"/.test(stmt)) offenders.push(`${path} (${m[1]})`);
    }
  }
  assert.deepEqual(offenders, []);
});

// === Owner's own private fields ===

test("readPlayerPrivate: returns the owner's row", () => {
  assert.deepEqual(readPlayerPrivate({ data: [{ email: "a@b.c", date_of_birth: "2005-04-01" }], error: null }), {
    email: "a@b.c",
    date_of_birth: "2005-04-01",
  });
  assert.deepEqual(readPlayerPrivate({ data: [{ email: null, date_of_birth: null }], error: null }), {
    email: null,
    date_of_birth: null,
  });
});

test("readPlayerPrivate: null whenever the fields were not loaded (so a save never overwrites them)", () => {
  assert.equal(readPlayerPrivate({ data: null, error: { message: "Could not find the function" } }), null);
  assert.equal(readPlayerPrivate({ data: [], error: null }), null); // not the owner / not an admin
  assert.equal(readPlayerPrivate({ data: null, error: null }), null);
  assert.equal(readPlayerPrivate({ data: [null], error: null }), null);
});

test("edit-profile only saves date_of_birth when it was loaded through get_player_private", () => {
  const text = readFileSync("app/edit-profile/page.tsx", "utf8");
  assert.match(text, /rpc\("get_player_private", \{ p_player_id: data\.id \}\)/);
  assert.match(text, /\.\.\.\(privateFields \? \{ date_of_birth: player\.date_of_birth \} : \{\}\)/);
  assert.doesNotMatch(text, /^\s*date_of_birth: player\.date_of_birth,/m);
});

// === Registration gating ===

test("registration prompt wording", () => {
  assert.equal(REGISTER_PROMPT_MESSAGE, "Register now to discover more talent and opportunities on ScoutAfrica.");
  assert.equal(REGISTER_PATH, "/signup");
});

test("Find Players shows the registration prompt to signed-out visitors and mounts the directory only for members", () => {
  const text = readFileSync("app/find-players/page.tsx", "utf8");
  assert.match(text, /if \(!signedIn\) \{[\s\S]*<RegisterPrompt \/>/);
  assert.match(text, /return <FindPlayersDirectory \/>;/);
  // The directory's player query lives inside FindPlayersDirectory, after the gate.
  assert.ok(text.indexOf("function FindPlayersDirectory") < text.indexOf('.from("player")'));
});

test("member-only actions prompt signed-out visitors to register", () => {
  assert.match(readFileSync("app/components/PremiumGuard.tsx", "utf8"), /if \(!signedIn\) \{\s*return <RegisterPrompt \/>;/);
  for (const path of ["app/player-profile/[slug]/page.tsx", "app/player-profile/components/ActionButtons.tsx"]) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /alert\(REGISTER_PROMPT_MESSAGE\)/, path);
    assert.match(text, /window\.location\.href = REGISTER_PATH/, path);
  }
});

test("shared public player profiles are NOT gated", () => {
  const page = readFileSync("app/player-profile/[slug]/page.tsx", "utf8");
  assert.doesNotMatch(page, /<RegisterPrompt|<PremiumGuard|import RegisterPrompt|import PremiumGuard/);
  const proxy = readFileSync("proxy.ts", "utf8");
  const matcher = proxy.slice(proxy.indexOf("matcher"));
  assert.doesNotMatch(matcher, /player-profile/);
});

// === Launch fixes ===

test("CSP allows highlight videos from Supabase Storage (media-src)", async () => {
  const rules = await nextConfig.headers();
  const csp = rules.flatMap((r) => r.headers).find((h) => h.key.toLowerCase() === "content-security-policy")?.value;
  assert.ok(csp, "CSP header present");
  const mediaSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("media-src"));
  assert.equal(mediaSrc, "media-src 'self' https://dbleskorympnnhekbkgo.supabase.co"); // production host when the env var is unset
});

test("site metadata is ScoutAfrica's, not the Next.js default", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /Create Next App|Generated by create next app/);
  assert.match(layout, /title: "ScoutAfrica \| /);
});

test("membership page no longer logs the user's email", () => {
  assert.doesNotMatch(readFileSync("app/membership/page.tsx", "utf8"), /console\.log\([^)]*\.email/);
});
