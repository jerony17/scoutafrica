import { FiUsers, FiHome, FiGlobe, FiPlayCircle } from "react-icons/fi";

// All 4 numbers are real, live counts passed down from app/page.tsx's own
// server-side Supabase queries - NOT the mockup's example numbers (7/3/6/12).
// Reusing this project's standing rule (established throughout every prior
// admin/analytics page this session): never fabricate a statistic when a
// real query is available. "Organizations" = verified club + academy +
// agent accounts (account_verifications, status = 'verified'); "Highlight
// Videos" = rows in the existing public.videos table.
type Props = {
  players: number;
  organizations: number;
  countries: number;
  videos: number;
};

export default function StatsBar({ players, organizations, countries, videos }: Props) {
  const stats = [
    { icon: FiUsers, value: players, label: "Players Registered" },
    { icon: FiHome, value: organizations, label: "Organizations" },
    { icon: FiGlobe, value: countries, label: "Countries" },
    { icon: FiPlayCircle, value: videos, label: "Highlight Videos" },
  ];

  return (
    // relative z-10 + negative top margin pulls this white bar up to
    // overlap the bottom edge of the dark hero section above it - hero's
    // own bottom padding (py-7/lg:py-8) is unchanged, so the -mt-4/-mt-5
    // overlap calibration from last round still applies safely here.
    //
    // Size target: ~1200px wide, ~72-75px tall. Width: added an explicit
    // max-w-[1200px] directly on the white card itself (the outer
    // max-w-7xl px-4/8 wrapper alone produced ~1216px, close but not the
    // specific number asked for). Height: py-6/py-8 (48-64px total) plus
    // the ~40px content row was ~88-104px, too tall - reduced to
    // py-4/py-5 (32-40px total) so total height lands at ~72-80px,
    // matching the target.
    <section className="relative z-10 bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 -mt-4 sm:-mt-5">
        {/* Mobile: single row of 4 (matches the approved mobile
            reference - it never shows a 2x2 wrap, even at 320px), each
            stat stacked icon-over-number-over-label instead of the
            desktop's icon-beside-text, with a thin divider between
            columns. All of that is mobile-only (md: reverts every one
            of these to the original desktop treatment) so the desktop
            bar is byte-for-byte the same classes as before. */}
        <div className="max-w-[1200px] mx-auto bg-white rounded-2xl shadow-xl grid grid-cols-4 divide-x divide-gray-200 md:divide-x-0 gap-2 sm:gap-3 md:gap-6 px-2 sm:px-6 md:px-10 py-4 sm:py-5">
          {stats.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="flex flex-col items-center text-center gap-1 md:flex-row md:items-center md:text-left md:gap-3 px-1"
            >
              <span className="shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
              </span>
              <div>
                <p className="text-base sm:text-xl font-bold text-gray-900">{value}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
