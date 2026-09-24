import Link from "next/link";
import { FaCrown } from "react-icons/fa";

// Positioning is responsive: on mobile this renders in normal document
// flow (wherever its caller places it) so it can never float/overlap
// whatever scrolls beneath it on a small screen. At sm and up it reverts
// to the original fixed bottom-left corner treatment, pixel-for-pixel
// unchanged. text-left is explicit because this component may now be
// mounted inside a `text-center` ancestor (the homepage hero section) -
// previously it was always rendered outside any such ancestor, so its
// text alignment relied on inheriting nothing; making it explicit keeps
// the original left-aligned look regardless of where it's mounted.
export default function PremiumPromoCard() {
  return (
    <Link
      href="/membership"
      className="static sm:fixed sm:bottom-6 sm:left-6 z-40 flex items-center gap-2.5 bg-green-900 border-2 border-amber-400 rounded-xl shadow-xl px-3 py-2.5 w-full sm:w-auto sm:max-w-[245px] text-left hover:shadow-2xl transition-shadow"
    >
      <FaCrown className="text-amber-400 text-xl shrink-0" />

      <div className="min-w-0">
        <p className="text-amber-400 text-[9px] font-semibold tracking-wider uppercase leading-none mb-1">
          ScoutAfrica Premium
        </p>

        <p className="text-white text-xs font-bold leading-tight">
          Get discovered faster.
        </p>

        <p className="text-white/80 text-[10px] leading-snug mb-1.5">
          Unlock premium features and opportunities.
        </p>

        <span className="inline-flex items-center gap-1 bg-white text-green-800 text-[10px] font-semibold px-2.5 py-1 rounded-md">
          Upgrade to Premium <span className="text-green-600">→</span>
        </span>
      </div>
    </Link>
  );
}