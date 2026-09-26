import Link from "next/link";
import Logo from "../components/Logo";
import FounderSection from "../components/FounderSection";
import {
  FiTarget,
  FiCompass,
  FiShield,
  FiEye,
  FiZap,
  FiHeart,
  FiAward,
  FiTrendingUp,
} from "react-icons/fi";

// Only the Hero's visual layout changed this round (added the Africa
// network illustration on the right, per the approved reference) - its
// copy is identical to before. Every other section (Our Story, Mission,
// Vision, Core Values, Why ScoutAfrica Exists) is byte-identical, both
// in copy and layout, to the previous version. Nav and footer unchanged.

const CORE_VALUES = [
  { label: "Integrity", icon: FiShield, description: "We do right by every player, club, and partner, even when no one is watching." },
  { label: "Transparency", icon: FiEye, description: "Clear processes, honest communication, no hidden agendas." },
  { label: "Opportunity", icon: FiZap, description: "Talent deserves a fair chance, regardless of background or location." },
  { label: "Innovation", icon: FiCompass, description: "We build better tools for a sport that deserves better infrastructure." },
  { label: "Community", icon: FiHeart, description: "Players, scouts, clubs and agents succeed together, not alone." },
  { label: "Excellence", icon: FiAward, description: "We hold ourselves to a professional standard in everything we ship." },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation - mobile-only sizing tier added below (Fix 2, mobile
          audit): logo/wordmark/buttons all shrink specifically below
          sm (640px), where "ScoutAfrica" and "Login" were measured
          overlapping by 19-44px at the four required widths. Every
          sm: value is untouched, so this nav is byte-identical to
          before at sm+ (tablet/desktop) - same technique already used
          on HomeHeader.tsx for the same class of bug, but applied here
          independently since that file is out of scope for this fix. */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 bg-white border-b border-gray-100">
        <Link href="/" className="flex items-center gap-1.5 sm:gap-3 hover:opacity-90 transition-opacity min-w-0">
          <Logo variant="badge" size="compact" className="w-8 h-8 sm:w-11 sm:h-12 shrink-0" />
          <span className="text-sm sm:text-2xl font-bold text-green-700 whitespace-nowrap">ScoutAfrica</span>
        </Link>
        <div className="flex gap-1.5 sm:gap-3 shrink-0">
          <Link href="/signin">
            <button className="px-2.5 py-1.5 text-xs sm:px-5 sm:py-2.5 sm:text-base border border-green-600 rounded-xl text-green-700 font-medium hover:bg-green-50 transition-colors whitespace-nowrap">
              Login
            </button>
          </Link>
          <Link href="/signup">
            <button className="px-2.5 py-1.5 text-xs sm:px-5 sm:py-2.5 sm:text-base bg-green-700 hover:bg-green-800 text-white rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-200 whitespace-nowrap">
              Register
            </button>
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-10 sm:py-14">
        {/* Mobile content order: pure CSS reordering via `order`, no
            DOM/content change. A previous pass put the founder card
            SECOND on mobile (main content first) to stop it from
            hogging the whole first viewport - that instead surfaced a
            different problem: the founder card's own loading skeleton
            (a pale bg-gray-50 box, see FounderSection.tsx) landing at
            the very bottom of a long page reads as "a large blank
            card," especially over real-device network latency where
            that loading state is visible for longer than on local dev.
            Now order-1 (founder first) / order-2 (main content second)
            on mobile - the loading flash still happens, but at the TOP
            of the page where it resolves almost immediately as part of
            initial load, not as a confusing dead zone discovered after
            scrolling past everything else.
            lg:order-1 / lg:order-2 are UNCHANGED from before on both
            elements, so desktop's arrangement (founder card on the
            left/first, main content on the right/second) is
            byte-identical to before this edit. `lg:contents` on the
            founder wrapper makes it disappear from the box model at
            lg+, so FounderSection's own `lg:w-[300px] shrink-0` classes
            apply directly as if it were still an unwrapped direct flex
            child - required only because FounderSection.tsx takes no
            props to attach the mobile-only order class to directly. */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-10">
          <div className="order-1 lg:order-1 lg:contents">
            <FounderSection />
          </div>

          <div className="order-2 lg:order-2 flex-1 min-w-0 space-y-16">
            {/* Hero - copy unchanged, layout now includes the Africa
                network illustration on the right, per the reference */}
            <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white rounded-3xl px-6 sm:px-10 py-10 sm:py-14">
              <div className="relative flex items-center gap-8">
                <div className="flex-1">
                  <p className="text-green-700 text-xs font-semibold tracking-wide uppercase mb-3">About ScoutAfrica</p>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight leading-tight">
                    Building the bridge between African talent and global opportunities.
                  </h1>
                  <p className="mt-4 text-gray-600 max-w-lg leading-relaxed">
                    We connect talented players with clubs, scouts, academies, and agents worldwide.
                  </p>
                </div>

                {/* Africa network illustration - pure inline SVG, no new
                    image asset or dependency, matching the dotted-map
                    treatment already used on the Home page hero */}
                <svg
                  className="hidden sm:block w-48 lg:w-64 h-auto shrink-0 opacity-70"
                  viewBox="0 0 200 200"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M100 15c10 18 25 26 42 30-6 14-3 30 6 42-17 4-29 15-34 32-12-10-27-13-42-9 2-17-5-31-18-40 15-7 23-21 24-37 7 4 16-1 22-18z"
                    fill="currentColor"
                    className="text-green-200"
                  />
                  <circle cx="60" cy="50" r="1.6" fill="currentColor" className="text-green-400" />
                  <circle cx="140" cy="70" r="1.6" fill="currentColor" className="text-green-400" />
                  <circle cx="150" cy="130" r="1.6" fill="currentColor" className="text-green-400" />
                  <circle cx="50" cy="140" r="1.6" fill="currentColor" className="text-green-400" />
                  <path
                    d="M60 50L100 100M140 70L100 100M150 130L100 100M50 140L100 100"
                    stroke="currentColor"
                    strokeWidth="0.75"
                    className="text-green-300"
                  />
                </svg>
              </div>
            </section>

            {/* Our Story - unchanged */}
            <section id="our-story">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Our Story</h2>
              <div className="text-gray-600 leading-relaxed space-y-4 text-base sm:text-lg">
                <p>
                  Across Africa, extraordinary football talent goes undiscovered every single day - not
                  because it isn&apos;t good enough, but because the players with the skill rarely have
                  the connections, resources, or visibility to reach the clubs, scouts, and academies
                  looking for exactly what they offer.
                </p>
                <p>
                  ScoutAfrica was built to close that gap. We created a single, trusted platform where
                  players can build a verified profile, and where clubs, academies, scouts, and agents can
                  discover talent directly - without gatekeepers, without guesswork, and without a player&apos;s
                  location deciding their ceiling.
                </p>
              </div>
            </section>

            {/* Mission + Vision - unchanged */}
            <div className="grid sm:grid-cols-2 gap-8">
              <section className="grid grid-cols-[auto,1fr] gap-4 items-start">
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <FiTarget className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Mission</h2>
                  <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                    To give every talented player in Africa a fair, transparent path to being discovered -
                    connecting them directly with verified clubs, academies, scouts, and agents around the world.
                  </p>
                </div>
              </section>

              <section className="grid grid-cols-[auto,1fr] gap-4 items-start">
                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                  <FiCompass className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Vision</h2>
                  <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                    To become the most trusted football scouting platform on the continent - the first
                    place clubs and scouts look, and the platform every serious player builds their profile on.
                  </p>
                </div>
              </section>
            </div>

            {/* Core Values - unchanged */}
            <section>
              <div className="flex items-center gap-2 mb-8">
                <FiTrendingUp className="w-6 h-6 text-green-600" />
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Core Values</h2>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {CORE_VALUES.map((value) => (
                  <div
                    key={value.label}
                    className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-gray-100 p-6 transition-all duration-300 hover:-translate-y-0.5"
                  >
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-4">
                      <value.icon className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1.5">{value.label}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{value.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Why ScoutAfrica Exists - unchanged */}
            <section className="bg-green-50 rounded-3xl p-8 sm:p-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Why ScoutAfrica Exists</h2>
              <div className="text-gray-700 leading-relaxed space-y-4 text-base sm:text-lg">
                <p>
                  Traditional football scouting depends heavily on physical proximity, personal
                  connections, and word of mouth - a system that quietly excludes players who don&apos;t
                  happen to be in the right city, playing for the right academy, or known to the right
                  person.
                </p>
                <p>
                  That means real talent gets missed, and clubs miss out on players who could have made a
                  difference. ScoutAfrica exists to remove that friction - giving players a professional,
                  verifiable way to be seen, and giving clubs, scouts, academies and agents a reliable way
                  to find them.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Footer - unchanged */}
      <footer className="border-t border-gray-100 bg-white py-10 text-center">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4 text-sm">
          <Link href="/privacy-policy" className="text-gray-500 hover:text-green-700 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/terms-of-service" className="text-gray-500 hover:text-green-700 transition-colors">
            Terms of Service
          </Link>
          <Link href="/contact" className="text-gray-500 hover:text-green-700 transition-colors">
            Contact Us
          </Link>
        </div>
        <p className="text-sm text-gray-400">&copy; {new Date().getFullYear()} ScoutAfrica. All rights reserved.</p>
      </footer>
    </main>
  );
}
