"use client";

import Link from "next/link";
import { FiShield, FiGlobe, FiTrendingUp, FiInfo } from "react-icons/fi";
import { useLanguage } from "../../lib/i18n";

const REASONS = [
  {
    icon: FiShield,
    title: "Verified Profiles",
    description: "Build a trusted and professional presence.",
  },
  {
    icon: FiGlobe,
    title: "Global Network",
    description: "Connect with clubs, academies, scouts, and agents.",
  },
  {
    icon: FiTrendingUp,
    title: "More Opportunities",
    description: "Increase your visibility and open new doors for your career.",
  },
];

export default function WhyChooseUs() {
  const { t } = useLanguage();

  return (
    <section className="bg-white py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="border-l-4 border-amber-500 pl-4 mb-8">
          <h2 className="text-2xl font-bold text-gray-900">{t("whyChooseScoutAfrica")}</h2>
          <p className="text-gray-500 mt-1">
            We are building the largest African football talent network, connecting players with real opportunities.
          </p>
        </div>

        {/* Desktop: unchanged - same 3 cards, same classes as before. */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-6">
          {REASONS.map((reason) => (
            <div key={reason.title} className="flex items-start gap-3 bg-gray-50 rounded-2xl p-5">
              <span className="shrink-0 w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                <reason.icon className="w-5 h-5" />
              </span>
              <div>
                <p className="font-semibold text-gray-900">{reason.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{reason.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile: the approved reference shows a compact 2x2 grid here,
            not the desktop's 3 full-width rows - and its 4th cell is a
            small "About Us" teaser card (icon + 1-line blurb, linking to
            /about), not a separate section. AboutSection.tsx (the full
            text+image+quote block) is hidden on mobile below for exactly
            this reason - matching the reference means this compact card
            replaces it there rather than both showing. Desktop's
            AboutSection is completely untouched. */}
        <div className="sm:hidden grid grid-cols-2 gap-3">
          {REASONS.map((reason) => (
            <div key={reason.title} className="bg-gray-50 rounded-2xl p-3.5">
              <span className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center mb-2">
                <reason.icon className="w-4 h-4" />
              </span>
              <p className="font-semibold text-gray-900 text-sm">{reason.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{reason.description}</p>
            </div>
          ))}

          <Link href="/about" className="bg-gray-50 rounded-2xl p-3.5 block">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
              <FiInfo className="w-4 h-4" />
            </span>
            <p className="font-semibold text-gray-900 text-sm">{t("aboutUs")}</p>
            <p className="text-xs text-gray-500 mt-0.5">Learn more about our mission, vision and impact.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}
