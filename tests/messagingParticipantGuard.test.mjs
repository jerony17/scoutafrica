// Migration 053's data guard must count every existing message that is not
// between the two participants of its conversation - including the NULL
// cases (deleted player, player without an account, missing scout, sender
// or receiver). Without the explicit IS NULL checks the pair test is NULL
// and NOT (NULL) silently drops the row. The behaviour itself was proven on
// the TEST project (supabase/tests/053_participant_guard_null_safe.sql).
// No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/053_messaging_participant_checks.sql", "utf8");
const guard = migration.slice(migration.indexOf("DO $guard$"), migration.indexOf("$guard$;") + "$guard$;".length);
const pairQuery = guard.slice(guard.indexOf("INTO bad_pair"), guard.indexOf(";", guard.indexOf("INTO bad_pair")));

test("the participant guard flags every NULL that would hide a bad message", () => {
  for (const check of ["p.user_id IS NULL", "c.scout_id IS NULL", "m.sender_id IS NULL", "m.receiver_id IS NULL"]) {
    assert.ok(pairQuery.includes(check), `missing: ${check}`);
  }
});

test("the NULL checks are OR-ed with the pair test, not AND-ed", () => {
  assert.match(
    pairQuery,
    /WHERE p\.user_id IS NULL OR c\.scout_id IS NULL\s+OR m\.sender_id IS NULL OR m\.receiver_id IS NULL\s+OR NOT \(\(m\.sender_id = c\.scout_id AND m\.receiver_id = p\.user_id\)\s+OR \(m\.sender_id = p\.user_id AND m\.receiver_id = c\.scout_id\)\)$/
  );
});

test("the player is still LEFT JOINed, so a deleted player is counted rather than skipped", () => {
  assert.match(pairQuery, /LEFT JOIN public\.player p ON p\.id = c\.player_id/);
});

test("the guard still aborts when it finds a bad message", () => {
  assert.match(guard, /IF bad_pair > 0 THEN[\s\S]*?RAISE EXCEPTION 'Aborting: % existing message\(s\) are not between the two conversation participants', bad_pair;/);
});

test("the send rule after the guard is unchanged", () => {
  assert.match(
    migration,
    /\(c\.scout_id = \(SELECT auth\.uid\(\)\) AND p\.user_id = messages\.receiver_id\)\s+OR \(p\.user_id = \(SELECT auth\.uid\(\)\) AND c\.scout_id = messages\.receiver_id\)/
  );
});
