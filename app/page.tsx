import Link from "next/link";
import { supabase } from "./lib/supabase";
import Logo from "./components/Logo";
import Image from "next/image";
import PremiumPromoCard from "./components/PremiumPromoCard";
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


<div className="relative z-10 flex flex-col items-center text-center">

  <Logo
    variant="hero"
    size="medium"
    width={320}
    height={180}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">

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