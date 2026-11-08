// Contact-request answer rules in the UI (app/lib/contactRequests.ts) and how
// Player Dashboard -> Requests and the NotificationBell use them. A request
// can be answered once, while pending - the same rule migration 055 enforces
// in the database. No network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contactRequestStatusLabel, isContactRequestPending } from "../app/lib/contactRequests.ts";

// === Rule ===

test("pending requests (and requests with no status) can be answered", () => {
  assert.equal(isContactRequestPending("pending"), true);
  assert.equal(isContactRequestPending(null), true);
  assert.equal(isContactRequestPending(undefined), true);
});

test("accepted and rejected requests cannot be answered again", () => {
  assert.equal(isContactRequestPending("accepted"), false);
  assert.equal(isContactRequestPending("rejected"), false);
});

test("status labels are clear for every state", () => {
  assert.equal(contactRequestStatusLabel("pending"), "Pending");
  assert.equal(contactRequestStatusLabel(null), "Pending");
  assert.equal(contactRequestStatusLabel("accepted"), "Accepted");
  assert.equal(contactRequestStatusLabel("rejected"), "Rejected");
});

// === Player Dashboard -> Requests ===

test("requests page shows Accept/Reject only for pending requests, and the answer otherwise", () => {
  const page = readFileSync("app/player-dashboard/requests/page.tsx", "utf8");
  // Both buttons sit inside the pending branch...
  assert.match(
    page,
    /\{isContactRequestPending\(request\.status\) \? \([\s\S]*?updateRequest\(request\.id, "accepted"\)[\s\S]*?updateRequest\(request\.id, "rejected"\)[\s\S]*?\) : \([\s\S]*?You have \{request\.status === "accepted" \? "accepted" : "rejected"\} this request\.[\s\S]*?\)\}/
  );
  // ...and the status line uses the clear label.
  assert.match(page, /<strong>Status:<\/strong> \{contactRequestStatusLabel\(request\.status\)\}/);
  // Exactly one Accept and one Reject call: no unconditional copies remain.
  assert.equal((page.match(/updateRequest\(request\.id, "accepted"\)/g) || []).length, 1);
  assert.equal((page.match(/updateRequest\(request\.id, "rejected"\)/g) || []).length, 1);
});

// === NotificationBell ===

test("notification bell loads the current request status and shows Accept/Decline only while pending", () => {
  const bell = readFileSync("app/components/NotificationBell.tsx", "utf8");
  assert.match(bell, /\.from\("contact_requests"\)\s*\.select\("id, status"\)\s*\.in\("id", requestIds\)/);
  // Buttons are rendered only for a known, pending status.
  assert.match(
    bell,
    /notification\.related_id in requestStatuses &&\s*isContactRequestPending\(requestStatuses\[notification\.related_id\]\) && \(\s*<div className="flex gap-2 mt-2">[\s\S]*?Accept Contact[\s\S]*?Decline Contact/
  );
  // Answered requests show their status instead.
  assert.match(
    bell,
    /!isContactRequestPending\(requestStatuses\[notification\.related_id\]\) && \(\s*<p[^>]*>\s*\{contactRequestStatusLabel\(requestStatuses\[notification\.related_id\]\)\}/
  );
  assert.equal((bell.match(/Accept Contact/g) || []).length, 1);
  assert.equal((bell.match(/Decline Contact/g) || []).length, 1);
});

test("the answer itself is unchanged: both screens still send only the status", () => {
  const page = readFileSync("app/player-dashboard/requests/page.tsx", "utf8");
  const bell = readFileSync("app/components/NotificationBell.tsx", "utf8");
  assert.match(page, /\.from\("contact_requests"\)\s*\.update\(\{ status \}\)\s*\.eq\("id", id\)/);
  assert.match(bell, /\.from\("contact_requests"\)\s*\.update\(\{ status \}\)\s*\.eq\("id", notification\.related_id\)/);
});
