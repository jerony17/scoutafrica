import { supabase } from "./lib/supabase";
import { getHeroSpotlightPlayer, getFeaturedPlayers } from "./lib/featuredPlayers";
import HomeHeader from "./components/homepage/HomeHeader";
import HeroSection from "./components/homepage/HeroSection";
import StatsBar from "./components/homepage/StatsBar";
import HowItWorks from "./components/homepage/HowItWorks";
import FeaturedPlayers from "./components/homepage/FeaturedPlayers";
import PremiumBanner from "./components/homepage/PremiumBanner";
import WhyChooseUs from "./components/homepage/WhyChooseUs";
import AboutSection from "./components/homepage/AboutSection";
import HomeFooter from "./components/homepage/HomeFooter";

// Homepage was fully static (prerendered once at build time), so live
// counts below never updated after deploy without a full rebuild. ISR,
// not force-dynamic: this keeps the page served from cache (fast, no
// per-visitor DB round-trip) while letting Next.js regenerate it in the
// background at most once every 5 minutes.
export const revalidate = 300;

export default async function Home() {
  // Every stat below is a real, live Supabase query - none of these are
  // placeholder numbers. Only the Hero Spotlight player and the 4
  // Featured Player slots use fallback/demo data for now, via
  // app/lib/featuredPlayers.ts, per that file's own documented plan for
  // a future Admin -> Featured Players page.
  const { count: playerCount } = await supabase
    .from("player")
    .select("*", { count: "exact", head: true });

  const { count: videoCount } = await supabase
    .from("videos")
    .select("*", { count: "exact", head: true });

  const { count: organizationCount } = await supabase
    .from("account_verifications")
    .select("*", { count: "exact", head: true })
    .eq("status", "verified")
    .in("account_type", ["club", "academy", "agent"]);

  const { data: nationalityRows } = await supabase
    .from("player")
    .select("nationality");

  const countryCount = new Set(
    (nationalityRows || [])
      .map((r) => r.nationality)
      .filter((n): n is string => Boolean(n))
  ).size;

  const [spotlightPlayer, featuredPlayers] = await Promise.all([
    getHeroSpotlightPlayer(),
    getFeaturedPlayers(),
  ]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-white">
      <HomeHeader />
      <HeroSection spotlightPlayer={spotlightPlayer} />
      <StatsBar
        players={playerCount ?? 0}
        organizations={organizationCount ?? 0}
        countries={countryCount}
        videos={videoCount ?? 0}
      />
      <HowItWorks />
      <FeaturedPlayers players={featuredPlayers} />
      <PremiumBanner />
      <WhyChooseUs />
      <AboutSection />
      <HomeFooter />
    </main>
  );
}
