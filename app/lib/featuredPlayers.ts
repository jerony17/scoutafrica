import { supabase } from "./supabase";
import type { Player } from "./types";

// Data layer for the homepage's Hero Spotlight player and the 4 Featured
// Player Profile slots - backed by public.featured_player_slots
// (045_featured_player_slots.sql), a fixed 5-row table an admin manages
// at /admin/featured-players. Every component that consumes
// getHeroSpotlightPlayer()/getFeaturedPlayers() is written against the
// types below and never hard-codes a player itself, so none of them
// needed to change when this switched from demo data to a real query.
//
// FALLBACK RULE: each slot falls back to its OWN demo player (defined
// below) whenever that slot is inactive, empty (player_id NULL), or its
// joined player row is missing - never a blanket "all-or-nothing"
// fallback. This is what lets an admin fill in one or two slots while
// the rest keep showing today's approved-design demo players, and it's
// also what keeps the homepage's appearance completely unchanged before
// any admin ever touches the new table (all 5 slots start empty).

export interface HeroSpotlightPlayer {
  id: string;
  name: string;
  photoUrl: string | null;
  country: string;
  countryFlag: string;
  position: string;
  age: number | null;
  heightCm: number | null;
  verified: boolean;
  highlightVideoUrl: string | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  // Added for clickability: real players route to their public profile,
  // demo/fallback entries stay null so the card falls back to
  // /find-players instead of a fabricated URL, matching how
  // FeaturedPlayerSlot.player.slug already works below.
  slug: string | null;
}

export interface FeaturedPlayerSlot {
  id: string;
  displayOrder: number;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
  // Eligibility note for the future real implementation: featured slots
  // should likely be restricted to verified and/or premium players -
  // left as a plain boolean here so the admin page can enforce whichever
  // rule is decided, without this file guessing at business logic that
  // hasn't been specified.
  premiumEligible: boolean;
  player: {
    id: string;
    name: string;
    photoUrl: string | null;
    position: string;
    age: number | null;
    country: string;
    countryFlag: string;
    // Real players have a slug (see app/player-profile/[slug]); demo
    // fallback entries below deliberately leave this null so
    // FeaturedPlayers.tsx knows to link to /find-players instead of a
    // fabricated profile URL that would 404.
    slug: string | null;
  };
}

// No flag/country-code column exists anywhere in the schema - confirmed
// via a live schema check - and public.player.nationality is free text
// typed by the player at signup (no dropdown, no ISO code - confirmed in
// app/register-player/page.tsx), so there is no authoritative source for
// a flag emoji. This is a best-effort, case-insensitive lookup covering
// the countries this app's own demo data and copy already reference,
// easily extended. An unmatched name renders with no flag rather than a
// wrong one.
const COUNTRY_FLAGS: Record<string, string> = {
  nigeria: "🇳🇬",
  ghana: "🇬🇭",
  "cote d'ivoire": "🇨🇮",
  "côte d'ivoire": "🇨🇮",
  "ivory coast": "🇨🇮",
  senegal: "🇸🇳",
  cameroon: "🇨🇲",
  "south africa": "🇿🇦",
  egypt: "🇪🇬",
  morocco: "🇲🇦",
  algeria: "🇩🇿",
  tunisia: "🇹🇳",
  kenya: "🇰🇪",
  mali: "🇲🇱",
  "burkina faso": "🇧🇫",
  drc: "🇨🇩",
  "democratic republic of the congo": "🇨🇩",
  congo: "🇨🇬",
  zambia: "🇿🇲",
  zimbabwe: "🇿🇼",
  tanzania: "🇹🇿",
  uganda: "🇺🇬",
  guinea: "🇬🇳",
  "guinea-bissau": "🇬🇼",
  benin: "🇧🇯",
  togo: "🇹🇬",
  gabon: "🇬🇦",
  angola: "🇦🇴",
  mozambique: "🇲🇿",
  namibia: "🇳🇦",
  botswana: "🇧🇼",
  gambia: "🇬🇲",
  "sierra leone": "🇸🇱",
  liberia: "🇱🇷",
  mauritania: "🇲🇷",
  niger: "🇳🇪",
  chad: "🇹🇩",
  rwanda: "🇷🇼",
  ethiopia: "🇪🇹",
  sudan: "🇸🇩",
  libya: "🇱🇾",
  comoros: "🇰🇲",
  "cape verde": "🇨🇻",
  "equatorial guinea": "🇬🇶",
  eswatini: "🇸🇿",
  lesotho: "🇱🇸",
  malawi: "🇲🇼",
  madagascar: "🇲🇬",
};

function countryToFlag(country: string | null): string {
  if (!country) return "";
  return COUNTRY_FLAGS[country.trim().toLowerCase()] ?? "";
}

function playerToFeaturedEntry(player: Player) {
  return {
    id: String(player.id),
    name: player.full_name ?? "Unnamed Player",
    photoUrl: player.photo_url,
    position: player.position ?? "—",
    age: player.age,
    country: player.nationality ?? "—",
    countryFlag: countryToFlag(player.nationality),
    slug: player.slug,
  };
}

function playerToHeroSpotlight(id: string, player: Player): HeroSpotlightPlayer {
  return {
    id,
    name: player.full_name ?? "Unnamed Player",
    photoUrl: player.photo_url,
    country: player.nationality ?? "—",
    countryFlag: countryToFlag(player.nationality),
    position: player.position ?? "—",
    age: player.age,
    heightCm: player.height,
    verified: player.verified ?? false,
    // No highlight-video linkage exists yet: public.videos.player_id is
    // a uuid (matches auth user ids elsewhere in this schema), not
    // public.player's bigint id, so there is no clean join available -
    // and the spotlight card's video area is itself just a static
    // play-button placeholder today (no real player component wired up
    // to actually play anything), so leaving this null changes nothing
    // observable versus the previous demo data, which was also always
    // null here.
    highlightVideoUrl: null,
    appearances: player.matches,
    goals: player.goals,
    assists: player.assists,
    slug: player.slug,
  };
}

// Fallback/demo data - one fixed demo entry per slot, so a slot that is
// inactive, empty, or whose player is gone falls back to exactly the
// same player it always has, independent of every other slot. slug is
// null on all of these so profile links safely fall back to
// /find-players instead of a fabricated 404 URL.
const DEMO_HERO_SPOTLIGHT: HeroSpotlightPlayer = {
  id: "demo-hero-spotlight",
  name: "Daniel Okafor",
  photoUrl: null,
  country: "Nigeria",
  countryFlag: "🇳🇬",
  position: "Forward",
  age: 19,
  heightCm: 178,
  verified: true,
  highlightVideoUrl: null,
  appearances: 12,
  goals: 8,
  assists: 4,
  slug: null,
};

const DEMO_FEATURED_PLAYERS: Record<string, FeaturedPlayerSlot> = {
  featured_1: {
    id: "demo-1",
    displayOrder: 1,
    active: true,
    startDate: null,
    endDate: null,
    premiumEligible: false,
    player: { id: "demo-1", name: "Daniel Okafor", photoUrl: null, position: "Forward", age: 19, country: "Nigeria", countryFlag: "🇳🇬", slug: null },
  },
  featured_2: {
    id: "demo-2",
    displayOrder: 2,
    active: true,
    startDate: null,
    endDate: null,
    premiumEligible: false,
    player: { id: "demo-2", name: "Kwame Asante", photoUrl: null, position: "Midfielder", age: 20, country: "Ghana", countryFlag: "🇬🇭", slug: null },
  },
  featured_3: {
    id: "demo-3",
    displayOrder: 3,
    active: true,
    startDate: null,
    endDate: null,
    premiumEligible: false,
    player: { id: "demo-3", name: "Yao Kouassi", photoUrl: null, position: "Defender", age: 21, country: "Côte d'Ivoire", countryFlag: "🇨🇮", slug: null },
  },
  featured_4: {
    id: "demo-4",
    displayOrder: 4,
    active: true,
    startDate: null,
    endDate: null,
    premiumEligible: false,
    player: { id: "demo-4", name: "Moussa Diop", photoUrl: null, position: "Winger", age: 18, country: "Senegal", countryFlag: "🇸🇳", slug: null },
  },
};

const FEATURED_SLOT_KEYS = ["featured_1", "featured_2", "featured_3", "featured_4"] as const;

type SlotRow = {
  slot_key: string;
  active: boolean;
  player: Player | null;
};

export async function getHeroSpotlightPlayer(): Promise<HeroSpotlightPlayer> {
  const { data } = await supabase
    .from("featured_player_slots")
    .select("slot_key, active, player:player_id(*)")
    .eq("slot_key", "hero_spotlight")
    .eq("active", true)
    .maybeSingle<SlotRow>();

  if (!data?.player) return DEMO_HERO_SPOTLIGHT;
  return playerToHeroSpotlight(`slot-hero_spotlight-${data.player.id}`, data.player);
}

export async function getFeaturedPlayers(): Promise<FeaturedPlayerSlot[]> {
  const { data } = await supabase
    .from("featured_player_slots")
    .select("slot_key, active, player:player_id(*)")
    .in("slot_key", FEATURED_SLOT_KEYS)
    .eq("active", true)
    .returns<SlotRow[]>();

  const bySlotKey = new Map((data ?? []).map((row) => [row.slot_key, row]));

  return FEATURED_SLOT_KEYS.map((slotKey, index) => {
    const row = bySlotKey.get(slotKey);
    if (!row?.player) return DEMO_FEATURED_PLAYERS[slotKey];

    return {
      id: `slot-${slotKey}-${row.player.id}`,
      displayOrder: index + 1,
      active: true,
      startDate: null,
      endDate: null,
      premiumEligible: false,
      player: playerToFeaturedEntry(row.player),
    };
  });
}
