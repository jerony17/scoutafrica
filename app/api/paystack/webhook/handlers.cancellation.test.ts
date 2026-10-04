import { test } from "node:test";
import assert from "node:assert/strict";

import { handleSubscriptionStatusChange } from "./handlers.ts";
import { makeFakeAdmin, type FakeCall } from "./test-helpers.ts";

test("subscription.disable: calls the RPC with p_event_type='subscription.disable'", async () => {
  const event = { event: "subscription.disable", data: { subscription_code: "SUB_1" } };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin(() => ({ data: [{ updated_id: 1, new_status: "cancelled" }], error: null }), calls);

  await handleSubscriptionStatusChange(event, admin);

  const rpcCall = calls.find((c) => c.table === "apply_paystack_subscription_status");
  assert.ok(rpcCall);
  const args = rpcCall!.payload as Record<string, unknown>;
  assert.equal(args.p_subscription_code, "SUB_1");
  assert.equal(args.p_event_type, "subscription.disable");
});

test("subscription.not_renew: calls the RPC with p_event_type='subscription.not_renew'", async () => {
  const event = { event: "subscription.not_renew", data: { subscription_code: "SUB_2" } };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin(() => ({ data: [{ updated_id: 2, new_status: "renewing" }], error: null }), calls);

  await handleSubscriptionStatusChange(event, admin);

  const args = calls.find((c) => c.table === "apply_paystack_subscription_status")!.payload as Record<string, unknown>;
  assert.equal(args.p_event_type, "subscription.not_renew");
});

test("missing subscription_code -> still calls the RPC with null, lets the DB function raise", async () => {
  const event = { event: "subscription.disable", data: {} };
  const calls: FakeCall[] = [];
  const admin = makeFakeAdmin(() => ({ data: null, error: { message: "apply_paystack_subscription_status requires a non-blank p_subscription_code", code: "P0001" } }), calls);

  await assert.rejects(
    () => handleSubscriptionStatusChange(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /non-blank p_subscription_code/);
      return true;
    }
  );
});

test("ambiguous match (RPC raises) -> propagates, does not silently succeed", async () => {
  const event = { event: "subscription.disable", data: { subscription_code: "SUB_DUP" } };
  const admin = makeFakeAdmin(() => ({ data: null, error: { message: "More than one subscription row matched this Paystack subscription_code", code: "P0001" } }));

  await assert.rejects(
    () => handleSubscriptionStatusChange(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /More than one subscription row/);
      return true;
    }
  );
});

test("unsupported event_type surfaced by the RPC -> propagates", async () => {
  const event = { event: "charge.success", data: { subscription_code: "SUB_X" } };
  const admin = makeFakeAdmin(() => ({ data: null, error: { message: "Unsupported Paystack event_type for apply_paystack_subscription_status: charge.success", code: "P0001" } }));

  await assert.rejects(
    () => handleSubscriptionStatusChange(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /Unsupported Paystack event_type/);
      return true;
    }
  );
});

// Defensive check (matches handleChargeSuccess): no error, but an empty or
// malformed result array must never be treated as a silent success.
test("empty result array with no error -> throws, does not falsely report success", async () => {
  const event = { event: "subscription.disable", data: { subscription_code: "SUB_EMPTY" } };
  const admin = makeFakeAdmin(() => ({ data: [], error: null }));

  await assert.rejects(
    () => handleSubscriptionStatusChange(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /returned no row/);
      return true;
    }
  );
});

test("null data with no error -> throws, does not falsely report success", async () => {
  const event = { event: "subscription.not_renew", data: { subscription_code: "SUB_NULL" } };
  const admin = makeFakeAdmin(() => ({ data: null, error: null }));

  await assert.rejects(
    () => handleSubscriptionStatusChange(event, admin),
    (err: unknown) => {
      assert.match((err as { message: string }).message, /returned no row/);
      return true;
    }
  );
});
