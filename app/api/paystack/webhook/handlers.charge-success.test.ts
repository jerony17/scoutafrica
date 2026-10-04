import { test } from "node:test";
import assert from "node:assert/strict";

import { handleChargeSuccess, handleSubscriptionCreate } from "./handlers.ts";
import { makeFakeAdmin, type FakeCall } from "./test-helpers.ts";

function baseEvent() {
  return {
    event: "charge.success",
    data: { reference: "ref_001", amount: 250000, currency: "NGN" },
  };
}

// --- Primary path: metadata present, defaults currency to NGN exactly as before ---
test("activation: metadata present -> calls RPC with p_user_id/p_billing_cycle, defaults currency", async () => {
  const event = {
    ...baseEvent(),
    data: {
      ...baseEvent().data,
      metadata: { user_id: "user-123", billing_cycle: "monthly" as const },
      customer: { customer_code: "CUS_abc" },
    },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin((call) => {
    if (call.table === "apply_paystack_charge_success") {
      return { data: [{ applied: true, subscription_id: 1, new_expires_at: "2026-11-01T00:00:00Z", reason: "applied" }], error: null };
    }
    return { data: null, error: null }; // reconcile RPC
  }, calls);

  await handleChargeSuccess(event, admin);

  const rpcCall = calls.find((c) => c.table === "apply_paystack_charge_success");
  const args = rpcCall!.payload as Record<string, unknown>;
  assert.equal(args.p_user_id, "user-123");
  assert.equal(args.p_billing_cycle, "monthly");
  assert.equal(args.p_currency, "NGN");

  const reconcileCall = calls.find((c) => c.table === "reconcile_paystack_pending_events");
  assert.ok(reconcileCall, "reconcile must still be called when customer_code is present");
});

// --- Missing renewal metadata: no metadata at all, resolved by codes ---
test("renewal: no metadata -> RPC called with p_user_id/p_billing_cycle null, codes passed through", async () => {
  const event = {
    event: "charge.success",
    data: {
      reference: "ref_renewal_1",
      amount: 250000,
      subscription_code: "SUB_xyz",
      customer: { customer_code: "CUS_abc" },
      currency: "USD",
    },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin((call) => {
    if (call.table === "apply_paystack_charge_success") {
      return { data: [{ applied: true, subscription_id: 7, new_expires_at: "2026-11-05T00:00:00Z", reason: "applied" }], error: null };
    }
    return { data: null, error: null };
  }, calls);

  await handleChargeSuccess(event, admin);

  const rpcCall = calls.find((c) => c.table === "apply_paystack_charge_success");
  const args = rpcCall!.payload as Record<string, unknown>;
  assert.equal(args.p_user_id, null);
  assert.equal(args.p_billing_cycle, null);
  assert.equal(args.p_subscription_code, "SUB_xyz");
  assert.equal(args.p_customer_code, "CUS_abc");
  assert.equal(args.p_currency, "USD");
});

// --- Currency fallback: renewal event with NO currency field at all ---
test("renewal: no currency on the event -> p_currency is null, not locally defaulted to NGN", async () => {
  const event = {
    event: "charge.success",
    data: { reference: "ref_renewal_nocurrency", amount: 250000, subscription_code: "SUB_nocur" },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin(() => ({
    data: [{ applied: true, subscription_id: 9, new_expires_at: "2026-11-05T00:00:00Z", reason: "applied" }],
    error: null,
  }), calls);

  await handleChargeSuccess(event, admin);

  const rpcCall = calls.find((c) => c.table === "apply_paystack_charge_success");
  const args = rpcCall!.payload as Record<string, unknown>;
  assert.equal(args.p_currency, null, "must pass null, letting the DB function fall back to the stored currency");
});

// --- Duplicate webhook: RPC reports a benign duplicate ---
test("duplicate delivery: RPC reports applied=false -> no throw, reconcile still attempted", async () => {
  const event = {
    event: "charge.success",
    data: { reference: "ref_dup", amount: 250000, customer: { customer_code: "CUS_dup" }, currency: "NGN" },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin((call) => {
    if (call.table === "apply_paystack_charge_success") {
      return { data: [{ applied: false, subscription_id: 3, new_expires_at: "2026-11-01T00:00:00Z", reason: "duplicate_reference" }], error: null };
    }
    return { data: null, error: null };
  }, calls);

  await assert.doesNotReject(() => handleChargeSuccess(event, admin));

  assert.ok(calls.find((c) => c.table === "reconcile_paystack_pending_events"), "reconcile must still run on a benign duplicate");
});

// --- Conflicting identifiers / any RPC error -> propagates, and does NOT proceed to reconcile ---
test("RPC error (e.g. conflicting identifiers) -> throws, and does not call reconcile afterward", async () => {
  const event = {
    event: "charge.success",
    data: { reference: "ref_conflict", amount: 250000, subscription_code: "SUB_1", customer: { customer_code: "CUS_1" }, currency: "NGN" },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin((call) => {
    if (call.table === "apply_paystack_charge_success") {
      return { data: null, error: { message: "Paystack subscription_code and customer_code resolved to different subscription rows", code: "P0001" } };
    }
    return { data: null, error: null };
  }, calls);

  await assert.rejects(
    () => handleChargeSuccess(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /different subscription rows/);
      return true;
    }
  );

  // Deterministic "rollback" check at the app layer: once the RPC call
  // itself errors, the handler must not proceed to any further write or
  // call - confirming no partial follow-up action happens after a failed
  // apply. (The database-level atomicity guarantee - that nothing is
  // partially committed by the function itself on a raised exception -
  // was already verified against a real, disposable Postgres instance in
  // this design's review phase, not re-proven here.)
  assert.equal(
    calls.filter((c) => c.table === "reconcile_paystack_pending_events").length,
    0,
    "must not attempt reconciliation after a failed charge-success apply"
  );
});

// --- subscription.create still stages + reconciles (unchanged) ---
test("subscription.create: still stages the event then reconciles (unchanged behavior)", async () => {
  const event = {
    event: "subscription.create",
    data: { subscription_code: "SUB_new", customer: { customer_code: "CUS_new" }, next_payment_date: "2026-11-01T00:00:00.000Z" },
  };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin(() => ({ data: null, error: null }), calls);

  await handleSubscriptionCreate(event, admin);

  assert.ok(calls.find((c) => c.table === "paystack_pending_events" && c.op === "upsert"));
  assert.ok(calls.find((c) => c.table === "reconcile_paystack_pending_events"));
});
