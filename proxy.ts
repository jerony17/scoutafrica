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
// VERSION NOTE / KNOWN BUG: this project is pinned to @supabase/ssr@0.5.2 (see
// package.json - the "^0.5.2" specifier only floats patch versions under npm's
// 0.x semver rules, so this has been stuck on an old patch line since Sprint 1A).
// @supabase/ssr@0.5.2 has documented broken generic type resolution when paired
// with newer @supabase/supabase-js versions (see supabase/supabase-js#1738),
// which cascades into contextual typing failures elsewhere in the same
// createServerClient call - including cookiesToSet here - even when the
// underlying types (CookieMethodsServer etc.) do exist in the shipped .d.ts
// files. Named imports and mechanical Parameters<> extraction off
// createServerClient both fail for the same underlying reason.
//
// RECOMMENDED REAL FIX: upgrade @supabase/ssr in package.json past this pinned
// patch line (`npm view @supabase/ssr versions` locally, then update the
// version and reinstall) - this works around a real package bug, not a typing
// puzzle solvable from userland code alone.
//
// Until that upgrade happens, the type below is a plain, self-contained
// interface based on the standard Set-Cookie option fields (matching Next.js's
// own ResponseCookie shape), NOT derived from @supabase/ssr's own types at all -
// so it doesn't depend on that library's broken generic resolution to work.
// No `any` anywhere in it.
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

interface CookieToSet {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: boolean | "lax" | "strict" | "none";
    priority?: "low" | "medium" | "high";
  };
}

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
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
