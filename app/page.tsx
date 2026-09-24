import Link from "next/link";
import { supabase } from "./lib/supabase";
import Logo from "./components/Logo";
import Image from "next/image";
import PremiumPromoCard from "./components/PremiumPromoCard";
import { FiGlobe } from "react-icons/fi";

// Homepage was fully static (prerendered once at build time - confirmed
// via `next build`'s "○ /" output), so the Players/African Countries
// stats below never updated after deploy without a full rebuild. ISR,
// not force-dynamic: this keeps the page served from cache (fast, no
// per-visitor DB round-trip) while letting Next.js regenerate it in the
// background at most once every 5 minutes, so the stats stay reasonably
// current without disabling caching for the rest of the homepage.
export const revalidate = 300;

export default async function Home() {

  const { count: playerCount } = await supabase
    .from("player")
    .select("*", { count: "exact", head: true });

  const { data: nationalityRows } = await supabase
    .from("player")
    .select("nationality");

  const countryCount = new Set(
    (nationalityRows || [])
      .map((r) => r.nationality)
      .filter((n): n is string => Boolean(n))
  ).size;

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 to-white">

      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-3 bg-white border-b border-gray-200 shadow-sm">

  <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
     <Logo
  variant="badge"
  size="compact"
/>
  


    <h1 className="text-lg font-bold text-green-700">
      ScoutAfrica
    </h1>
  </Link>

  <div className="flex gap-3">

    <Link href="/signin">
      <button className="px-4 py-2 border border-green-600 rounded-lg text-green-700">
        Login
      </button>
    </Link>

    <Link href="/signup">
      <button className="px-4 py-2 bg-green-600 text-white rounded-lg">
        Register
      </button>
    </Link>

  </div>

</nav>

      {/* Hero Section */}
  <section className="relative overflow-hidden min-h-[85vh] flex flex-col items-center justify-center text-center px-6">
  
  <div className="absolute inset-0 bg-gradient-to-b from-green-50 via-white to-green-50"></div>
<div className="absolute inset-0 opacity-20 pointer-events-none">
  <Image
    src="/branding/football-watermark.png"
    alt=""
    fill
    className="object-cover"
  />
</div>

{/* Decorative footballer - left side, facing right toward the logo/headline.
    z-[1]: above the watermark/gradient behind it, below the z-10 centered
    content in front of it. Hidden below sm so it can never crowd the
    headline/buttons on small phones, per the mobile layout rule. */}
<div
  className="hidden sm:block absolute left-0 bottom-18 z-[1] w-[260px] md:w-[340px] lg:w-[420px] xl:w-[480px] pointer-events-none select-none"
  aria-hidden="true"
>
  <Image
    src="/branding/hero-footballer.png"
    alt=""
    width={1371}
    height={1147}
    className="w-full h-auto"
  />
</div>

{/* Our Mission - informational only, not a link/button. Right side,
    mirroring PremiumPromoCard's bottom-left placement/inset (bottom-6),
    approximately the same footprint (max-w-[250px] vs its max-w-[245px]).
    z-[1]: same layer as the footballer, behind the z-10 centered content.
    Hidden below sm, matching the footballer's mobile treatment, so it
    can't crowd the headline/buttons on small phones. */}
<div className="hidden sm:block absolute right-6 bottom-6 z-[1] max-w-[250px] bg-white/95 border-2 border-green-800 rounded-xl shadow-xl px-4 py-3.5">
  <div className="flex items-center gap-1.5 mb-1.5">
    <FiGlobe className="text-green-700 text-base shrink-0" />
    <p className="text-amber-600 text-[9px] font-semibold tracking-wider uppercase leading-none">
      ScoutAfrica Mission
    </p>
  </div>

  <p className="text-green-900 text-sm font-bold leading-snug mb-1.5">
    Connecting Talent. Creating Opportunities.
  </p>

  <p className="text-gray-600 text-[11px] leading-snug mb-2">
    We help African football talent connect with clubs, academies, scouts, and agents around the world.
  </p>

  <ul className="space-y-1">
    <li className="flex items-start gap-1.5 text-[10px] text-gray-700 leading-snug">
      <span className="text-amber-500 mt-0.5">●</span> Discover football talent
    </li>
    <li className="flex items-start gap-1.5 text-[10px] text-gray-700 leading-snug">
      <span className="text-amber-500 mt-0.5">●</span> Connect players with opportunities
    </li>
    <li className="flex items-start gap-1.5 text-[10px] text-gray-700 leading-snug">
      <span className="text-amber-500 mt-0.5">●</span> Build a stronger football network
    </li>
  </ul>
</div>

<div className="relative z-10 flex flex-col items-center text-center">

  <Logo
    variant="hero"
    size="medium"
    width={400}
    height={225}
    className="mb-1"
  />

  <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-green-700 max-w-3xl leading-tight">
    Where African Football Dreams Meet Global Opportunity.
  </h2>

  <p className="mt-2 text-base text-gray-600 max-w-2xl leading-7">
    Create your profile. Get discovered by verified clubs,
    academies, scouts, and agents. Your football journey starts here.
  </p>

  <div className="mt-3 flex flex-col sm:flex-row gap-4">

    <Link href="/register-player">
      <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg">
        Join as Player
      </button>
    </Link>

    <Link href="/signup">
      <button className="border border-green-600 text-green-600 px-6 py-3 rounded-lg">
        Join as Organization
      </button>
    </Link>

  </div>

</div>

</section>

{/* Statistics Section */ }
  <section className="bg-white py-16">

    <div className="max-w-6xl mx-auto px-6">

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">

        <div className="rounded-2xl bg-white p-8 shadow-lg border border-gray-100 transition hover:shadow-xl">
          <h2 className="text-4xl font-bold text-green-600">
            {playerCount ?? 0}
          </h2>
          <p className="mt-2 text-gray-600">
            Players
          </p>
        </div>

        <div className="p-6 rounded-2xl shadow-md">
          <h2 className="text-2xl font-bold text-gray-400">
            Coming Soon
          </h2>
          <p className="mt-2 text-gray-600">
            Verified Organizations
          </p>
        </div>

        <div className="p-6 rounded-2xl shadow-md">
          <h2 className="text-4xl font-bold text-green-600">
            {countryCount}
          </h2>
          <p className="mt-2 text-gray-600">
            African Countries
          </p>
        </div>

        <Link
          href="/about"
          className="group p-6 rounded-2xl shadow-md border border-transparent hover:border-green-200 hover:shadow-xl transition flex flex-col items-center"
        >
          <h2 className="text-2xl font-bold text-green-600">
            About Us
          </h2>
          <p className="mt-2 text-gray-600">
            Learn more about ScoutAfrica, our mission, and our Founder &amp; CEO.
          </p>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-600 group-hover:text-amber-700">
            Learn More <span aria-hidden="true">→</span>
          </span>
        </Link>

      </div>

    </div>

  </section>

  <footer className="border-t bg-white py-8 text-center text-sm text-gray-500">
    <div className="flex justify-center gap-6 mb-2">
      <Link href="/privacy-policy" className="hover:text-green-700">
        Privacy Policy
      </Link>
      <Link href="/terms-of-service" className="hover:text-green-700">
        Terms of Service
      </Link>
    </div>
    <p>&copy; {new Date().getFullYear()} ScoutAfrica</p>
  </footer>
<PremiumPromoCard />
</main> 
  ) ; 
}