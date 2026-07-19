import Link from "next/link";
import { supabase } from "./lib/supabase";

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

      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-5 bg-white shadow-sm">
        <h1 className="text-2xl font-bold text-green-700">
          ScoutAfrica
        </h1>

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
      <section className="flex flex-col items-center justify-center text-center px-6 py-24">
        <h1 className="text-6xl font-bold text-green-700">
          ScoutAfrica
        </h1>

        <p className="mt-6 text-2xl font-semibold text-gray-800 max-w-3xl">
          Where African Football Dreams Meet Global Opportunity.
        </p>

        <p className="mt-4 text-gray-600 max-w-2xl">
          Create your profile. Get discovered by verified clubs,
          academies, scouts, and agents. Your football journey starts here.
        </p>
<div className="mt-10 flex gap-4">

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
      </section>

{/* Statistics Section */ }
  <section className="bg-white py-16">

    <div className="max-w-6xl mx-auto px-6">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">

        <div className="p-6 rounded-2xl shadow-md">
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

</main> 
  ) ; 
}
