"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isArrayOf, isPlayer } from "../lib/types";
import type { Player } from "../lib/types";
import * as Flags from "country-flag-icons/react/3x2";

const FLAG_CODES: Record<string, keyof typeof Flags> = {
  Japan: "JP",
  Nigeria: "NG",
  Ghana: "GH",
  Cameroon: "CM",
  "South Africa": "ZA",
};

function CountryFlag({ country }: { country: string | null }) {
  if (!country) return null;
  const code = FLAG_CODES[country.trim()];
  if (!code) return null;
  const Flag = Flags[code];
  return <Flag title={country} className="w-5 h-3.5 rounded-[2px] inline-block" />;
}

// Same 10-field completeness measure used on the Player Dashboard, kept
// consistent across the app rather than inventing a second definition.
const COMPLETENESS_FIELDS: (keyof Player)[] = [
  "full_name",
  "photo_url",
  "position",
  "current_club",
  "nationality",
  "age",
  "height",
  "weight",
  "bio",
  "preferred_foot",
];

function profileCompletion(player: Player): number {
  const filled = COMPLETENESS_FIELDS.filter((key) => Boolean(player[key])).length;
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}

function CompletionRing({ percent }: { percent: number }) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? "#16a34a" : percent >= 50 ? "#d97706" : "#dc2626";

  return (
    <div className="relative w-10 h-10 shrink-0" title={`${percent}% profile complete`}>
      <svg viewBox="0 0 40 40" className="w-10 h-10 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
        {percent}
      </span>
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="w-48 h-auto mx-auto" aria-hidden="true">
      <rect x="10" y="20" width="180" height="100" rx="12" fill="#f0fdf4" />
      <circle cx="80" cy="65" r="28" fill="none" stroke="#16a34a" strokeWidth="4" />
      <line x1="100" y1="85" x2="122" y2="107" stroke="#16a34a" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M65 65 h30 M80 50 v30"
        stroke="#16a34a"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="w-full h-56 bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
        <div className="h-10 bg-gray-200 rounded-xl mt-4" />
      </div>
    </div>
  );
}

const PLAYERS_PER_PAGE = 12;

export default function FindPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [positionFilter, setPositionFilter] = useState("Position");
  const [nationFilter, setNationFilter] = useState("Nation");
  const [ageFilter, setAgeFilter] = useState("Age");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    async function loadPlayers() {
      const { data, error } = await supabase
        .from("player")
        .select("*")
        .order("full_name")
        .range(0, page * PLAYERS_PER_PAGE - 1);

      if (error) {
        console.error(error);
      } else {
        setPlayers(isArrayOf(data, isPlayer) ? data : []);
      }

      setLoading(false);
    }

    loadPlayers();
  }, [page]);

  const filteredPlayers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        player.full_name?.toLowerCase().includes(search) ||
        player.scoutafrica_id?.toLowerCase().includes(search) ||
        player.current_club?.toLowerCase().includes(search);

      const matchesPosition =
        positionFilter === "Position" || player.position === positionFilter;

      const matchesNation =
        nationFilter === "Nation" || player.nationality === nationFilter;

      const matchesAge = (() => {
        if (ageFilter === "Age") return true;
        const age = player.age;
        if (age == null) return false;
        if (ageFilter === "Under 18") return age < 18;
        if (ageFilter === "18–21") return age >= 18 && age <= 21;
        if (ageFilter === "22–25") return age >= 22 && age <= 25;
        if (ageFilter === "26+") return age >= 26;
        return true;
      })();

      const matchesVerified = !verifiedOnly || player.verified === true;

      return matchesSearch && matchesPosition && matchesNation && matchesAge && matchesVerified;
    });
  }, [players, searchTerm, positionFilter, nationFilter, ageFilter, verifiedOnly]);

  const hasActiveFilters =
    positionFilter !== "Position" ||
    nationFilter !== "Nation" ||
    ageFilter !== "Age" ||
    verifiedOnly ||
    Boolean(searchTerm);

  function clearFilters() {
    setPositionFilter("Position");
    setNationFilter("Nation");
    setAgeFilter("Age");
    setVerifiedOnly(false);
    setSearchTerm("");
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero search section */}
      <div className="bg-gradient-to-b from-black to-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <p className="text-green-400 text-sm font-semibold tracking-[0.2em] uppercase mb-3">
            ScoutAfrica Talent Network
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold mb-3">Find Players</h1>
          <p className="text-gray-300 max-w-xl mb-8">
            Search verified player profiles from across the continent by name,
            ScoutAfrica ID, or club.
          </p>

          <div className="bg-white rounded-2xl p-2 flex items-center shadow-2xl">
            <svg
              className="w-5 h-5 text-gray-400 ml-3 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, ScoutAfrica ID, or club..."
              className="flex-1 px-3 py-3 text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-3 mt-4">
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="rounded-xl bg-white/10 border border-white/20 text-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option className="text-black">Position</option>
              <option className="text-black">Goalkeeper</option>
              <option className="text-black">Defender</option>
              <option className="text-black">Midfielder</option>
              <option className="text-black">Forward</option>
            </select>

            <select
              value={nationFilter}
              onChange={(e) => setNationFilter(e.target.value)}
              className="rounded-xl bg-white/10 border border-white/20 text-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option className="text-black">Nation</option>
              <option className="text-black">Nigeria</option>
              <option className="text-black">Japan</option>
              <option className="text-black">Ghana</option>
              <option className="text-black">South Africa</option>
              <option className="text-black">Cameroon</option>
            </select>

            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
              className="rounded-xl bg-white/10 border border-white/20 text-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option className="text-black">Age</option>
              <option className="text-black">Under 18</option>
              <option className="text-black">18–21</option>
              <option className="text-black">22–25</option>
              <option className="text-black">26+</option>
            </select>

            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              aria-pressed={verifiedOnly}
              className={`rounded-xl px-4 py-2 text-sm font-medium border transition ${
                verifiedOnly
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20"
              }`}
            >
              ✓ Verified only
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-gray-300 underline px-2 py-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        {loading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && filteredPlayers.length === 0 && (
          <div className="text-center py-16">
            <EmptyIllustration />
            <p className="text-xl font-semibold text-gray-800 mt-6">No players found.</p>
            <p className="text-gray-500 mt-1">
              Try a different search term or adjust your filters.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-green-700 font-medium underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && filteredPlayers.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => {
              const completion = profileCompletion(player);

              return (
                <div
                  key={player.id}
                  className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition duration-300 overflow-hidden flex flex-col"
                >
                  <div className="relative w-full h-56 bg-gray-100">
                    <Image
                      src={
                        player.photo_url ||
                        "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400"
                      }
                      alt={player.full_name || "Player"}
                      fill
                      className="object-cover"
                    />

                    {player.verified && (
                      <span className="absolute top-3 right-3 bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Verified
                      </span>
                    )}

                    {player.scoutafrica_id && (
                      <span className="absolute bottom-3 left-3 bg-black/70 text-white text-[11px] font-mono tracking-wider px-2.5 py-1 rounded-lg">
                        {player.scoutafrica_id}
                      </span>
                    )}
                  </div>

                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 leading-tight">
                          {player.full_name || "Unnamed Player"}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {player.position || "Position unknown"}
                        </p>
                      </div>
                      <CompletionRing percent={completion} />
                    </div>

                    <div className="mt-4 space-y-1.5 text-sm text-gray-600 flex-1">
                      <p className="flex items-center gap-2">
                        <CountryFlag country={player.nationality} />
                        {player.nationality || "Nationality unknown"}
                      </p>
                      <p>🏟️ {player.current_club || "Unattached"}</p>
                      <p>🎂 {player.age ? `${player.age} yrs` : "Age unknown"}</p>
                    </div>

                    {player.slug ? (
                      <Link
                        href={`/player-profile/${player.slug}`}
                        className="mt-5 block w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-center font-semibold transition"
                      >
                        View Profile
                      </Link>
                    ) : (
                      <button
                        disabled
                        title="This player's profile isn't available yet"
                        className="mt-5 block w-full bg-gray-300 text-gray-500 py-2.5 rounded-xl text-center font-semibold cursor-not-allowed"
                      >
                        Profile Unavailable
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredPlayers.length > 0 && filteredPlayers.length >= players.length && (
          <div className="text-center mt-10">
            <button
              onClick={() => setPage(page + 1)}
              className="bg-black hover:bg-gray-800 text-white px-8 py-3 rounded-xl font-semibold transition"
            >
              Load More
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
