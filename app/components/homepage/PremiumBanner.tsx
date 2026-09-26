"use client";

import Link from "next/link";
import { FaCrown } from "react-icons/fa";
import { useLanguage } from "../../lib/i18n";

// Inline full-width banner, replacing the floating PremiumPromoCard on
// this specific redesigned homepage (the new mockup has no floating
// corner card at all). PremiumPromoCard.tsx itself is left untouched in
// case it's still wanted elsewhere - this page simply no longer renders
// it, per matching the new design exactly rather than layering both.
export default function PremiumBanner() {
  const { t } = useLanguage();

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
      <Link
        href="/membership"
        className="group flex flex-col sm:flex-row items-center gap-4 sm:gap-6 bg-gradient-to-r from-green-900 to-green-800 border-2 border-amber-400 rounded-2xl p-6 hover:shadow-xl transition-shadow"
      >
        <FaCrown className="text-amber-400 text-3xl shrink-0" />

        <div className="flex-1 text-center sm:text-left">
          <p className="text-amber-400 text-xs font-semibold tracking-widest uppercase mb-1">{t("scoutAfricaPremium")}</p>
          <p className="text-white text-lg font-bold">{t("getDiscoveredFaster")}</p>
          <p className="text-white/80 text-sm">Unlock premium features and more opportunities for your football journey.</p>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1.5 bg-white text-green-800 font-semibold px-5 py-2.5 rounded-xl group-hover:shadow-md transition-shadow">
          {t("upgradeToPremium")} <span className="text-green-600" aria-hidden="true">→</span>
        </span>
      </Link>
    </section>
  );
}
