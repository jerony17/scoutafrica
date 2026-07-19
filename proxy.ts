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
// The cookie-handling block below matches Supabase's official current
// "AI Prompt: Bootstrap Next.js v16 app with Supabase Auth" reference pattern
// exactly (including the setAll(cookiesToSet, headers) two-argument shape and
// the header-copying step), rather than a hand-typed reconstruction - an
// earlier fix here typed cookiesToSet manually but omitted the second
// `headers` argument the current @supabase/ssr cookie-methods interface
// expects, which broke contextual type inference and caused the implicit-any
// build error even after that fix. Deliberately left both parameters
// untyped here, same as Supabase's own official example, so this always
// matches whatever @supabase/ssr version is actually installed rather than
// a type shape guessed from outside the project.
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
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
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
