import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Sprint 1A - Security Foundation
//
// NOTE: Next.js 16 renamed the "middleware" file/function convention to "proxy".
// A file named middleware.ts with an exported `middleware` function is silently
// NOT picked up in Next 16 - no build error, it just never runs. This file was
// previously middleware.ts/middleware() and that naming is why the route guards
// below were not actually executing (see Sprint 1A follow-up investigation).
// Must remain named proxy.ts at the project root, exporting a function named `proxy`.
//
// VERSION NOTE: this project is on @supabase/ssr@0.5.2. Two prior attempts here
// guessed at named type exports (CookieOptions, CookieMethodsServer) that don't
// resolve cleanly in this version - confirmed by directly checking the installed
// package. Rather than guess a third name, the type below is derived MECHANICALLY
// from createServerClient's own real signature via TypeScript's Parameters<>
// utility, so it is correct for whatever is actually installed, regardless of
// what any internal type is named or whether it's separately exported at all.
//
// Background on why this was needed: @supabase/ssr's `cookies` config accepts a
// union of shapes (current getAll/setAll vs. the deprecated get/set/remove style,
// kept side by side during the migration your own VS Code tooltip flagged).
// TypeScript does not reliably push contextual parameter types into an object
// literal's methods when the literal is checked against a union of interfaces -
// that's why annotating cookiesToSet directly inside the inline literal never
// actually fixed anything. Extract<> below narrows that union down to
// specifically the member that has a setAll method, using structural matching
// rather than a guessed name - no `any` anywhere in this.
//
// IMPORTANT: user_metadata.account_type is set/editable by the signed-in user via the
// client SDK. It is used below ONLY to redirect a signed-in player/scout/club away from
// a dashboard that clearly isn't theirs (a UX nicety), never as the actual security
// boundary. The real authorization for all data access lives in Supabase RLS policies
// (see migrations 001-006), which check auth.uid() against real ownership columns.
//
// app_metadata, by contrast, can only be written by a service-role/server context, never
// by the client - so it IS safe to use as a real security boundary. is_admin is stored
// there for that reason.

type ServerClientOptions = NonNullable<Parameters<typeof createServerClient>[2]>;
type CookiesConfig = NonNullable<ServerClientOptions["cookies"]>;
type ModernCookiesConfig = Extract<CookiesConfig, { setAll: unknown }>;

const PLAYER_ROUTES = ["/player-dashboard"];
const SCOUT_ROUTES = ["/scout-dashboard"];
const CLUB_ROUTES = ["/club-dashboard"];
const AGENT_ROUTES = ["/agent-dashboard"];
const ADMIN_ROUTES = ["/admin"];

function matches(path: string, routes: string[]) {
  return routes.some((route) => path === route || path.startsWith(`${route}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const cookieMethods: ModernCookiesConfig = {
    getAll() {
      return request.cookies.getAll();
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => {
        request.cookies.set(name, value);
      });
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options);
      });
    },
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  );

  const path = request.nextUrl.pathname;

  const isProtected =
    matches(path, PLAYER_ROUTES) ||
    matches(path, SCOUT_ROUTES) ||
    matches(path, CLUB_ROUTES) ||
    matches(path, AGENT_ROUTES) ||
    matches(path, ADMIN_ROUTES);

  if (!isProtected) {
    return response;
  }

  // getUser() (not getSession()) revalidates the token against Supabase Auth rather
  // than trusting a locally-stored/cookie value as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(signInUrl);
  }

  if (matches(path, ADMIN_ROUTES)) {
    const isAdmin = user.app_metadata?.is_admin === true;
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  const accountType = user.user_metadata?.account_type;

  if (matches(path, PLAYER_ROUTES) && accountType !== "player") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (matches(path, SCOUT_ROUTES) && accountType !== "scout") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (matches(path, CLUB_ROUTES) && accountType !== "club") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (matches(path, AGENT_ROUTES) && accountType !== "agent") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/player-dashboard/:path*",
    "/scout-dashboard/:path*",
    "/club-dashboard/:path*",
    "/agent-dashboard/:path*",
  ],
};
