"use client";

import { useState } from "react";
import Link from "next/link";
import { FiSearch, FiMenu, FiX } from "react-icons/fi";
import Logo from "../Logo";
import { useLanguage, type TranslationKey } from "../../lib/i18n";

// New expanded nav for the redesigned homepage only - every other page in
// this app keeps its own existing simple header, untouched. Every link
// below points at a route that genuinely exists (confirmed against the
// app's actual routes before writing this) - "For Organizations" ->
// /signup (where clubs/academies/agents/scouts actually register) and
// "Pricing" -> /membership (the real existing plans/pricing page), since
// neither the mockup's literal labels nor dead placeholder hrefs would be
// honest here. The search icon links to /find-players (the real search
// page) rather than being a decorative dead button.
//
// MOBILE MENU: added per the approved mobile reference, which shows
// Login/Register always visible plus a hamburger icon - previously this
// nav was simply `hidden md:flex` with NO mobile fallback at all, so a
// phone visitor had no way to reach Find Players/For
// Organizations/About Us/Pricing. Needed "use client" + state for the
// toggle - this file was a server component before, and nothing else
// on the homepage needed that, so this is the one component this pass
// converts.
// Translation keys, not literal labels - single source of truth for
// both the desktop nav and the mobile hamburger nav below (previously
// two separate hardcoded copies of the same 5 labels; unified so a
// translated label only needs to be defined once, not kept in sync by
// hand in two places). href list and order are unchanged from before.
const NAV_LINKS: { href: string; key: TranslationKey }[] = [
  { href: "/", key: "home" },
  { href: "/find-players", key: "findPlayers" },
  { href: "/signup", key: "forOrganizations" },
  { href: "/about", key: "aboutUs" },
  { href: "/membership", key: "pricing" },
];

export default function HomeHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-8 py-3">
        <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 hover:opacity-90 transition-opacity">
          {/* Badge shrunk at the base/mobile tier via a CSS size
              override (w-8 h-8, was the component's fixed 44x48) - sm+
              overrides it right back to the original 44x48 (w-11 h-12
              matches those px values), so tablet/desktop is pixel
              identical to before. Needed alongside the wordmark's own
              shrink below: measured via a real screenshot at 320px that
              text-sm alone still visually truncated to "ScoutAfri..." -
              the `truncate` class only hides overflow, it doesn't
              change how much text actually fits. */}
          <Logo variant="badge" size="compact" className="w-8 h-8 sm:w-11 sm:h-12" />
          <span className="text-sm sm:text-lg font-bold text-green-700 truncate">ScoutAfrica</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
          {/* Same className per link as before the unification - "/"
              keeps its distinct active-state styling, every other link
              keeps its plain hover style. Only the text source changed. */}
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={link.href === "/" ? "text-green-700 font-semibold" : "hover:text-green-700"}
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link
            href="/find-players"
            aria-label="Search players"
            className="hidden sm:inline-flex p-2 text-gray-500 hover:text-green-700 transition-colors"
          >
            <FiSearch className="w-5 h-5" />
          </Link>

          {/* px/text shrunk at the base/mobile tier only (was px-3
              py-1.5 text-sm at every width below sm) - same reason as
              the wordmark above: at 320px, Login + Register + the
              hamburger didn't fit without forcing the logo to truncate.
              sm+ is untouched. */}
          <Link href="/signin">
            <button className="px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-base border border-green-600 rounded-lg text-green-700 whitespace-nowrap">
              {t("login")}
            </button>
          </Link>

          <Link href="/signup">
            <button className="px-2 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-base bg-green-600 hover:bg-green-700 text-white rounded-lg whitespace-nowrap">
              {t("register")}
            </button>
          </Link>

          <button
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="md:hidden p-1 text-gray-700"
          >
            {mobileMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-1 text-sm font-medium text-gray-600">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 hover:text-green-700"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
