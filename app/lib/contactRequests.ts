// Shared by player-dashboard/requests and the NotificationBell. No runtime
// imports - unit-tested in tests/contactRequests.test.mjs.
//
// A player may answer a contact request once, while it is pending. A request
// with no status counts as pending (the database default is 'pending'; old
// rows may be NULL). Migration 055 enforces the same rule in the database:
// answering an accepted or rejected request changes nothing.
export function isContactRequestPending(status: string | null | undefined): boolean {
  return (status ?? "pending") === "pending";
}

export function contactRequestStatusLabel(status: string | null | undefined): string {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Pending";
}
