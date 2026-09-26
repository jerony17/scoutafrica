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
};

export default nextConfig;
