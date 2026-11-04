// Unit tests for the PayPal refund/reversal policy (app/lib/paypalRefunds.ts)
// and the billing rules it relies on. No network, no database: every
// PayPal and Supabase call is a fake. Run with `npm test` (Node 24 strips
// the TypeScript types natively).
import { test } from "node:test";
import assert from "node:assert/strict";
import { processRefundEvent, revocationUpdate, nextPaymentStatus, saleIdCandidates } from "../app/lib/paypalRefunds.ts";
import { findConfirmedPayment, paidUntil } from "../app/lib/paypalBilling.ts";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const SALE = "8XK11111AA2222222";
const SUB = "I-TESTSUB00001";

function apiError(status) {
  return Object.assign(new Error(`PayPal request failed`), { status });
}

// Fake world: one recorded $16 monthly payment on a linked, Premium row.
function world(overrides = {}) {
  const state = {
    payment: { saleId: SALE, subscriptionRowId: 7, paymentStatus: "success", paymentDate: "2026-11-01T10:00:00.000Z" },
    row: {
      id: 7,
      status: "premium",
      payment_provider: "paypal",
      paypal_subscription_id: SUB,
      expires_at: "2026-12-04T10:00:00.000Z",
      cancelled_at: null,
    },
    transactionStatus: "REFUNDED",
    paypalStatus: "ACTIVE",
    cancelBehaviour: "ok", // ok | 422 | fail | noop
    listFails: false,
    statusGetFails: false,
    ...overrides,
  };
  const calls = { cancel: 0, setPaymentStatus: [], revoke: [], records: [], list: 0 };

  const deps = {
    async findRecordedPayment(ids) {
      return state.payment && ids.includes(state.payment.saleId) ? { ...state.payment } : null;
    },
    async loadSubscriptionRow(id) {
      return state.row && state.row.id === id ? { ...state.row } : null;
    },
    async listTransactions(subscriptionId) {
      calls.list++;
      if (state.listFails) throw apiError(503);
      if (subscriptionId !== SUB) return [];
      return [{ id: SALE, status: state.transactionStatus, time: "2026-11-01T10:00:00Z", amount_with_breakdown: { gross_amount: { currency_code: "USD", value: "16.00" } } }];
    },
    async getSubscriptionStatus() {
      if (state.statusGetFails) throw apiError(500);
      return state.paypalStatus;
    },
    async cancelSubscription() {
      calls.cancel++;
      if (state.cancelBehaviour === "fail") throw apiError(500);
      if (state.cancelBehaviour === "422") throw apiError(422);
      if (state.cancelBehaviour === "ok") state.paypalStatus = "CANCELLED";
    },
    async setPaymentStatus(saleId, status) {
      calls.setPaymentStatus.push(status);
      state.payment.paymentStatus = status;
    },
    async revokeAccess(rowId, update) {
      calls.revoke.push(update);
      Object.assign(state.row, update);
    },
    async recordOutcome(record) {
      calls.records.push(record);
    },
    now: () => NOW,
  };
  return { state, calls, deps };
}

const refunded = (id = "WH-REFUND-1") => ({ id, event_type: "PAYMENT.SALE.REFUNDED", resource: { id: "REFUND-ID-1", sale_id: SALE } });
const reversed = (id = "WH-REVERSE-1") => ({ id, event_type: "PAYMENT.SALE.REVERSED", resource: { id: SALE } });

test("full refund: revokes Premium now and cancels the PayPal subscription (confirmed)", async () => {
  const { state, calls, deps } = world();
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.kind, "done");
  assert.equal(result.retry, false);
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.deepEqual(calls.setPaymentStatus, ["refunded"]);
  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.expires_at, NOW.toISOString());
  assert.equal(state.row.cancelled_at, NOW.toISOString());
  assert.equal(calls.cancel, 1);
  assert.equal(result.record.paypalSubscriptionId, SUB); // from our row, not the payload
});

test("partial refund: keeps Premium, does not cancel, records partially_refunded", async () => {
  const { state, calls, deps } = world({ transactionStatus: "PARTIALLY_REFUNDED" });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "partial_refund_access_retained");
  assert.equal(result.record.paypalCancellation, "not_required");
  assert.equal(result.retry, false);
  assert.deepEqual(calls.setPaymentStatus, ["partially_refunded"]);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.equal(state.row.status, "premium");
});

test("refund event while PayPal still reports COMPLETED: flagged for review, retried, access untouched", async () => {
  const { state, calls, deps } = world({ transactionStatus: "COMPLETED" });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, true);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.deepEqual(calls.setPaymentStatus, []);
  assert.equal(state.row.status, "premium");
});

test("reversal (chargeback): revokes Premium, cancels subscription, records reversed", async () => {
  const { state, calls, deps } = world({ transactionStatus: "COMPLETED" });
  const result = await processRefundEvent(deps, reversed());

  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.deepEqual(calls.setPaymentStatus, ["reversed"]);
  assert.equal(state.row.status, "cancelled");
  assert.equal(calls.cancel, 1);
});

test("duplicate full-refund event: no second revocation and no second cancel request", async () => {
  const { calls, deps } = world();
  await processRefundEvent(deps, refunded());
  const second = await processRefundEvent(deps, refunded());

  assert.equal(second.record.outcome, "access_revoked");
  assert.equal(second.record.paypalCancellation, "confirmed");
  assert.equal(calls.revoke.length, 1);
  assert.equal(calls.cancel, 1);
  assert.deepEqual(calls.setPaymentStatus, ["refunded"]); // not rewritten
  assert.equal(calls.records.length, 2); // same event id -> upserted in place
  assert.equal(calls.records[0].eventId, calls.records[1].eventId);
});

test("reversal after a refund: status upgrades to reversed, still only one cancel", async () => {
  const { calls, deps } = world();
  await processRefundEvent(deps, refunded());
  await processRefundEvent(deps, reversed());
  assert.deepEqual(calls.setPaymentStatus, ["refunded", "reversed"]);
  assert.equal(calls.cancel, 1);
});

test("sale not recorded by ScoutAfrica: review only, nothing revoked or cancelled", async () => {
  const { calls, deps } = world({ payment: null });
  const result = await processRefundEvent(deps, refunded());

  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, false);
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
  assert.equal(calls.list, 0);
});

test("subscription row no longer PayPal (switched provider): review only", async () => {
  const { calls, deps } = world({
    row: { id: 7, status: "premium", payment_provider: "stripe", paypal_subscription_id: null, expires_at: "2027-01-01T00:00:00Z", cancelled_at: null },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
});

test("subscription row missing: review only", async () => {
  const { calls, deps } = world({ row: null });
  const result = await processRefundEvent(deps, reversed());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
});

test("sale not on the linked PayPal subscription (an older one): review only", async () => {
  const { calls, deps } = world({
    row: { id: 7, status: "premium", payment_provider: "paypal", paypal_subscription_id: "I-OTHERSUB0002", expires_at: "2027-01-01T00:00:00Z", cancelled_at: null },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
  assert.equal(calls.cancel, 0);
});

test("PayPal API failure while verifying: review + retry, access untouched", async () => {
  const { state, calls, deps } = world({ listFails: true });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(result.retry, true);
  assert.match(result.record.reviewReason, /HTTP 503/);
  assert.equal(calls.revoke.length, 0);
  assert.equal(state.row.status, "premium");
});

test("PayPal cancel fails: access still revoked, cancellation pending (not confirmed), retried", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "fail" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(result.retry, true);
  assert.equal(state.row.status, "cancelled");
  assert.equal(calls.cancel, 1);
});

test("PayPal accepts cancel but still reports ACTIVE: not marked confirmed", async () => {
  const { deps } = world({ cancelBehaviour: "noop" });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(result.retry, true);
});

test("cancel returns 422 and PayPal reports CANCELLED on re-read: confirmed", async () => {
  const { state, deps } = world({ cancelBehaviour: "422" });
  deps.cancelSubscription = async () => {
    state.paypalStatus = "CANCELLED";
    throw apiError(422);
  };
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.equal(result.retry, false);
});

test("subscription status lookup fails: cancellation pending, never assumed", async () => {
  const { calls, deps } = world({ statusGetFails: true });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.outcome, "access_revoked");
  assert.equal(result.record.paypalCancellation, "pending");
  assert.equal(calls.cancel, 0);
  assert.equal(result.retry, true);
});

test("retry after a failed cancel completes it without revoking twice", async () => {
  const { state, calls, deps } = world({ cancelBehaviour: "fail" });
  await processRefundEvent(deps, refunded());
  state.cancelBehaviour = "ok";
  const second = await processRefundEvent(deps, refunded());
  assert.equal(second.record.paypalCancellation, "confirmed");
  assert.equal(second.retry, false);
  assert.equal(calls.revoke.length, 1);
  assert.equal(calls.cancel, 2);
});

test("ordinary-cancelled (renewing) member with a full refund loses the remaining paid time", async () => {
  const { state, deps } = world({
    paypalStatus: "CANCELLED",
    row: { id: 7, status: "renewing", payment_provider: "paypal", paypal_subscription_id: SUB, expires_at: "2026-12-04T10:00:00.000Z", cancelled_at: "2026-11-05T00:00:00.000Z" },
  });
  const result = await processRefundEvent(deps, refunded());
  assert.equal(result.record.paypalCancellation, "confirmed");
  assert.equal(state.row.status, "cancelled");
  assert.equal(state.row.expires_at, NOW.toISOString());
  assert.equal(state.row.cancelled_at, "2026-11-05T00:00:00.000Z"); // original cancel time kept
});

test("events without an id, or of another type, are ignored", async () => {
  const { calls, deps } = world();
  assert.equal((await processRefundEvent(deps, { event_type: "PAYMENT.SALE.REFUNDED", resource: { sale_id: SALE } })).kind, "ignored");
  assert.equal((await processRefundEvent(deps, { id: "x", event_type: "PAYMENT.SALE.COMPLETED", resource: { id: SALE } })).kind, "ignored");
  assert.equal(calls.records.length, 0);
});

test("event with no sale id: review only", async () => {
  const { calls, deps } = world();
  const result = await processRefundEvent(deps, { id: "WH-X", event_type: "PAYMENT.SALE.REVERSED", resource: {} });
  assert.equal(result.record.outcome, "needs_review");
  assert.equal(calls.revoke.length, 0);
});

test("helpers: revocationUpdate, nextPaymentStatus, saleIdCandidates", () => {
  const expired = { id: 1, status: "expired", payment_provider: "paypal", paypal_subscription_id: SUB, expires_at: "2026-10-01T00:00:00.000Z", cancelled_at: null };
  assert.equal(revocationUpdate(expired, NOW), null);
  const active = { ...expired, status: "premium", expires_at: "2027-01-01T00:00:00.000Z" };
  assert.equal(revocationUpdate(active, NOW).expires_at, NOW.toISOString());

  assert.equal(nextPaymentStatus("success", "partially_refunded"), "partially_refunded");
  assert.equal(nextPaymentStatus("partially_refunded", "refunded"), "refunded");
  assert.equal(nextPaymentStatus("refunded", "partially_refunded"), null);
  assert.equal(nextPaymentStatus("reversed", "refunded"), null);

  assert.deepEqual(saleIdCandidates({ resource: { id: "R1", sale_id: "S1" } }), ["S1", "R1"]);
  assert.deepEqual(saleIdCandidates({ resource: { id: 5 } }), []);
});

test("unchanged: monthly $16 / annual $170 payment confirmation and paid periods", () => {
  const tx = (status, value) => [{ id: "T1", status, time: "2026-01-31T00:00:00Z", amount_with_breakdown: { gross_amount: { currency_code: "USD", value } } }];
  assert.equal(findConfirmedPayment(tx("COMPLETED", "16.00"), "T1", { currency: "USD", amount: 16 }).ok, true);
  assert.equal(findConfirmedPayment(tx("COMPLETED", "170.00"), "T1", { currency: "USD", amount: 170 }).ok, true);
  assert.equal(findConfirmedPayment(tx("REFUNDED", "16.00"), "T1", { currency: "USD", amount: 16 }).ok, false);
  assert.equal(findConfirmedPayment(tx("COMPLETED", "8.00"), "T1", { currency: "USD", amount: 16 }).ok, false);
  assert.equal(paidUntil("2026-01-31T00:00:00Z", "monthly").toISOString(), "2026-03-03T00:00:00.000Z");
  assert.equal(paidUntil("2026-11-03T14:31:35Z", "annual").toISOString(), "2027-11-06T14:31:35.000Z");
});
