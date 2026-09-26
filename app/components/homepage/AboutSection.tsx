import Link from "next/link";

// Layout matches the reference: heading/description/Learn More in a left
// column, a large image area on the right with the founder/CEO quote
// overlaid at the bottom of it (not a separate boxed quote).
//
// The reference's team-huddle-at-sunset photo isn't a real licensed asset
// in this project, so this uses a gradient standing in for that mood, at
// the same position/dimensions/crop area a real photo would occupy - swap
// the single div below for a real <Image> when one is available, nothing
// else needs to change. The quote is the reference's own text, attributed
// only to "Founder & CEO" (no name), matching the reference's own
// anonymized attribution - the real founder_profile table has no
// populated row yet (confirmed empty), so this is illustrative copy, not
// a sourced quote from a real person.
export default function AboutSection() {
  return (
    // Hidden on mobile - the approved mobile reference replaces this
    // whole section with a compact "About Us" teaser card as the 4th
    // cell of WhyChooseUs's 2x2 grid (see WhyChooseUs.tsx) rather than
    // showing this full text+image+quote block too. Desktop (sm+) is
    // completely unchanged.
    <section className="hidden sm:block bg-white py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="border-l-4 border-amber-500 pl-4">
              <h2 className="text-2xl font-bold text-gray-900">About ScoutAfrica</h2>
              <p className="text-gray-500 mt-2 leading-relaxed max-w-md">
                ScoutAfrica is a platform dedicated to discovering, developing, and connecting African football
                talent with global opportunities. We believe in the power of African talent.
              </p>
            </div>

            <Link
              href="/about"
              className="mt-5 inline-flex items-center gap-1.5 border border-green-600 text-green-700 font-semibold px-5 py-2.5 rounded-xl hover:bg-green-50 transition-colors"
            >
              Learn More <span aria-hidden="true">→</span>
            </Link>
          </div>

          {/* Image placeholder - same slot a real photo would fill later. */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-950 via-green-900 to-amber-900 aspect-[16/10] min-h-[260px]">
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="text-white text-sm sm:text-base leading-relaxed">
                &ldquo;ScoutAfrica gives African players a real platform to be seen and connect with global
                opportunities. It&apos;s more than a website, it&apos;s a movement for African football.&rdquo;
              </p>
              <p className="mt-2 text-xs font-semibold text-green-200">— Founder &amp; CEO</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
