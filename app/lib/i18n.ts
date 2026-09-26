"use client";

import { useEffect, useState } from "react";

// Intentionally NOT a full i18n system - no routing, no next-intl, no
// per-locale pages. Just a small dictionary of approved, hardcoded UI
// strings (nav/header/footer/section-heading labels) plus a hook that
// picks English or Japanese based on the browser's own language. Never
// used for anything that comes from Supabase (player names, bios,
// stats, club/academy/org names, etc.) - those are always rendered as
// plain values, never passed through `t()`.
//
// SSR/initial render always resolves to "en" (the default/fallback),
// matching what a no-JS visitor sees - `navigator` does not exist on
// the server, so detection can only happen after mount. This is a
// deliberate hydration-safety choice, not an oversight: the language
// then flips to "ja" via a normal post-mount state update for Japanese
// browsers, which is a plain re-render (not a hydration mismatch -
// React only compares the *initial* render against the server HTML).
// Server-side Accept-Language detection was considered and rejected:
// `headers()` is a Request-time API in this Next.js version and using
// it would force the homepage into fully dynamic rendering, breaking
// its existing `export const revalidate = 300` ISR caching - a real
// performance regression, not just a style choice.
export type Lang = "en" | "ja";

const DICTIONARY = {
  // Header / footer nav (shared labels - reused by both)
  home: { en: "Home", ja: "ホーム" },
  findPlayers: { en: "Find Players", ja: "選手を探す" },
  forOrganizations: { en: "For Organizations", ja: "組織向け" },
  aboutUs: { en: "About Us", ja: "私たちについて" },
  pricing: { en: "Pricing", ja: "料金" },
  login: { en: "Login", ja: "ログイン" },
  register: { en: "Register", ja: "登録" },

  // Footer-only
  privacyPolicy: { en: "Privacy Policy", ja: "プライバシーポリシー" },
  termsOfService: { en: "Terms of Service", ja: "利用規約" },
  contact: { en: "Contact", ja: "お問い合わせ" },

  // Featured Players
  featuredPlayerProfiles: { en: "Featured Player Profiles", ja: "注目の選手" },
  viewAllPlayers: { en: "View all players →", ja: "すべての選手を見る →" },
  viewProfile: { en: "View Profile →", ja: "プロフィールを見る →" },

  // Why Choose ScoutAfrica
  whyChooseScoutAfrica: { en: "Why Choose ScoutAfrica?", ja: "ScoutAfricaが選ばれる理由" },

  // How It Works
  howScoutAfricaWorks: { en: "How ScoutAfrica Works", ja: "ScoutAfricaの仕組み" },

  // Premium
  scoutAfricaPremium: { en: "ScoutAfrica Premium", ja: "ScoutAfricaプレミアム" },
  getDiscoveredFaster: { en: "Get discovered faster.", ja: "もっと早く見つけてもらおう。" },
  upgradeToPremium: { en: "Upgrade to Premium", ja: "プレミアムにアップグレード" },

  // About
  aboutScoutAfrica: { en: "About ScoutAfrica", ja: "ScoutAfricaについて" },
  learnMore: { en: "Learn More", ja: "詳細を見る" },
} as const;

export type TranslationKey = keyof typeof DICTIONARY;

function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const raw = navigator.language || "";
  return raw.toLowerCase().startsWith("ja") ? "ja" : "en";
}

// v1: browser language only, no manual override, no localStorage - by
// explicit instruction, kept out of this first pass.
export function useLanguage() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    // Deferred so the state update doesn't happen synchronously inside
    // the effect body - same fix already applied elsewhere in this
    // project (app/admin/players/page.tsx, app/admin/featured-players/
    // page.tsx) for this exact lint rule.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setLang(detectLang());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function t(key: TranslationKey): string {
    return DICTIONARY[key][lang];
  }

  return { lang, t };
}
