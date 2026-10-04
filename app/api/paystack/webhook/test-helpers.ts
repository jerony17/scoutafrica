import type { SupabaseClient } from "@supabase/supabase-js";

// A minimal fake of the subset of the Supabase JS client surface handlers.ts
// actually uses (.from().select()/.upsert()/.update(), chained .eq(), and a
// terminal .single()/.maybeSingle() or none), plus .rpc(). Not a general
// Supabase mock - just enough to drive handlers.ts in isolation from a real
// database, with each test's `resolve` callback deciding what each call
// should return based on the table, operation, and .eq() filters applied.

export interface FakeCall {
  table: string;
  op: "select" | "upsert" | "update" | "rpc";
  eq: Array<[string, unknown]>;
  payload?: unknown;
  opts?: unknown;
  terminal: "single" | "maybeSingle" | "none";
}

export interface FakeResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export type FakeResolver = (call: FakeCall) => FakeResult;

/** Convenience: a resolver's default answer when a test doesn't care about a given call. */
export const EMPTY_OK: FakeResult = { data: null, error: null };
export const EMPTY_LIST_OK: FakeResult = { data: [], error: null };

export function makeFakeAdmin(resolve: FakeResolver, calls: FakeCall[] = []): SupabaseClient {
  function builder(
    table: string,
    op: FakeCall["op"],
    payload?: unknown,
    opts?: unknown
  ) {
    const eq: Array<[string, unknown]> = [];
    const finish = (terminal: FakeCall["terminal"]) => {
      const call: FakeCall = { table, op, eq, payload, opts, terminal };
      calls.push(call);
      return Promise.resolve(resolve(call));
    };
    const chain = {
      select() {
        return chain;
      },
      eq(column: string, value: unknown) {
        eq.push([column, value]);
        return chain;
      },
      single() {
        return finish("single");
      },
      maybeSingle() {
        return finish("maybeSingle");
      },
      then(onFulfilled: (value: FakeResult) => unknown, onRejected?: (reason: unknown) => unknown) {
        return finish("none").then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  const admin = {
    from(table: string) {
      return {
        select() {
          return builder(table, "select");
        },
        upsert(payload: unknown, opts?: unknown) {
          return builder(table, "upsert", payload, opts);
        },
        update(payload: unknown) {
          return builder(table, "update", payload);
        },
      };
    },
    async rpc(name: string, args: unknown) {
      const call: FakeCall = { table: name, op: "rpc", eq: [], payload: args, terminal: "none" };
      calls.push(call);
      return resolve(call);
    },
  };

  return admin as unknown as SupabaseClient;
}

/** Finds the value passed to a particular .eq(column, ...) call, if any. */
export function eqValue(call: FakeCall, column: string): unknown {
  return call.eq.find(([c]) => c === column)?.[1];
}
