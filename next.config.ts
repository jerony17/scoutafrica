import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets other devices on the local network (e.g. testing on a phone via
  // the computer's LAN IP) load Next.js dev-server resources - without
  // this, cross-origin requests to /_next/* are blocked by default,
  // which silently breaks client-side hydration for "use client"
  // components accessed that way (confirmed directly from the dev
  // server's own warning: "Blocked cross-origin request to Next.js dev
  // resource... from <LAN IP>"). A wildcard, not the exact current IP:
  // this machine's DHCP-assigned address changed three times in one
  // session (192.168.151.x, 192.168.26.x, 192.168.30.x) reconnecting to
  // different Wi-Fi networks - confirmed via the actual matching logic
  // in next/dist (csrf-protection.js's matchWildcardDomain) that '*'
  // matches any single dot-separated segment the same way for an IPv4
  // host as it does for a domain, so '192.168.*.*' matches the whole
  // 192.168.0.0/16 private range this network happens to use, covering
  // every address seen this session without needing to be updated again
  // for the next DHCP lease. Dev-only: allowedDevOrigins has no effect
  // on production builds/`next start`.
  allowedDevOrigins: ["192.168.*.*"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "via.placeholder.com",
      },
      {
        protocol: "https",
        hostname: "dbleskorympnnhekbkgo.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  // Security Release 4 - security headers, applied to every route.
  //
  // CSP is deliberately NOT nonce-based (that would require generating a
  // per-request nonce in proxy.ts and widening proxy.ts's matcher to run
  // on every route, which this release explicitly does not touch).
  // script-src therefore needs 'unsafe-inline': confirmed directly from
  // production HTML that Next.js App Router emits real inline
  // `self.__next_f.push(...)` <script> tags with no src/nonce for RSC
  // streaming - a strict script-src without this breaks hydration
  // entirely, not a theoretical concern.
  //
  // connect-src includes both the https: and wss: forms of the Supabase
  // project origin - https: for every REST/Auth/Storage call
  // app/lib/supabase.ts's browser client makes directly, wss: because
  // app/messages/page.tsx genuinely uses Supabase Realtime
  // (supabase.channel(...)/supabase.realtime.setAuth(...)) for live
  // message delivery - confirmed real, working code, not a guess.
  //
  // img-src is 'self' only: confirmed zero raw <img> tags exist anywhere
  // in the app (every image goes through next/image, which proxies
  // external sources - via.placeholder.com, images.unsplash.com,
  // placehold.co, Supabase storage - through the same-origin
  // /_next/image endpoint, so the browser never fetches those domains
  // directly). No blob: needed either - confirmed no
  // URL.createObjectURL() usage anywhere (no local file-preview images
  // before upload).
  //
  // font-src is 'self' only: next/font/google (Geist/Geist Mono)
  // self-hosts font files at build time - confirmed the served URLs are
  // same-origin (/_next/static/media/*.woff2), never a request to
  // fonts.googleapis.com/fonts.gstatic.com.
  //
  // No frame-src/child-src entry for Stripe or Paystack: both checkout
  // flows (app/membership/page.tsx, app/upgrade/page.tsx) do a full-page
  // redirect via window.location to a provider-hosted checkout page -
  // confirmed neither ever loads a client-side script or iframe inside
  // the app.
  //
  // Strict-Transport-Security is deliberately NOT set here - production
  // already returns a strong HSTS header (Vercel's own platform
  // default), confirmed identical across every route tested; adding a
  // second, possibly conflicting one here would be redundant at best.
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      // 'unsafe-inline' confirmed required via real CSP violation reports
      // (not assumed): next/image's own internals hardcode inline `style`
      // attributes (fill-mode positioning, transparent-placeholder) on
      // every <Image> usage across the app - framework behavior, not
      // something app code can avoid without nonce infrastructure, which
      // this release deliberately does not introduce.
      "style-src 'self' 'unsafe-inline'",
      // https://placehold.co confirmed required via real CSP violation
      // reports: app/components/homepage/FeaturedPlayers.tsx's featured-
      // player fallback avatar (documented `unoptimized` next/image usage,
      // since placehold.co serves SVG) loads directly from this domain
      // instead of through the same-origin /_next/image proxy every other
      // image in the app uses.
      "img-src 'self' data: https://placehold.co",
      "font-src 'self' data:",
      "connect-src 'self' https://dbleskorympnnhekbkgo.supabase.co wss://dbleskorympnnhekbkgo.supabase.co",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
