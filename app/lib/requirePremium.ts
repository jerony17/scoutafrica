import { NextResponse } from "next/server";
import { isPremium } from "./isPremium";

// The one place every Premium API route checks access - never re-check
// premium status with ad-hoc logic in an individual route. Returns null
// when the user IS premium (caller proceeds); returns the exact 403
// response to send back when they are not (caller returns it directly).
//
// Usage in any Route Handler, after your existing auth check has already
// resolved `user`:
//
//   const guard = await requirePremium(user.id);
//   if (guard) return guard;
//   // ...premium-only logic below this line
export async function requirePremium(userId: string | null | undefined): Promise<NextResponse | null> {
  const hasPremium = await isPremium(userId);

  if (!hasPremium) {
    return NextResponse.json({ error: "Premium membership required." }, { status: 403 });
  }

  return null;
}
