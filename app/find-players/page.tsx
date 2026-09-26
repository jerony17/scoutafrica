"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { FiSearch, FiCheckCircle, FiUser, FiX } from "react-icons/fi"; 
import { CountryFlag } from "../lib/CountryFlag";

// === Confirmed against the live database before writing this page ===
// player table has no player_type column (Professional/Semi-Pro/Academy)
// and no view-count column - both are genuinely absent, not just
// unused, so "Player Type" filtering and "Most Viewed" sorting are
// omitted below rather than faked against data that doesn't exist. The
// brief's own "(if available)" on Most Viewed already anticipated this.
//
// Premium status lives on the separate `subscriptions` table, but its
// RLS only allows a row's owner or an admin to read it - a public,
// unauthenticated visitor browsing this page cannot determine any other
// player's premium status through a direct query. Implementing "Premium
// only" or a premium badge here would require either a new public-safe
// database view or a new server-side API route - both out of scope per
// explicit instruction not to touch the schema. Also omitted, not faked.
//
// "Verified only" IS fully implemented - player.verified is a real,
// publicly-readable column.

const PAGE_SIZE = 12;

const POSITIONS = [
  "Goalkeeper",
  "Centre-Back",
  "Full-Back",
  "Defensive Midfielder",
  "Central Midfielder",
  "Attacking Midfielder",
  "Winger",
  "Striker",
];

type SortOption = "newest" | "oldest" | "alphabetical" | "age";

type PlayerRow = {
  id: number;
  full_name: string | null;
  age: number | null;
  position: string | null;
  nationality: string | null;
  current_club: string | null;
  scoutafrica_id: string | null;
  photo_url: string | null;
  cover_photo_url: string | null;
  verified: boolean | null;
  slug: string | null;
};

export default function FindPlayersPage() {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [position, setPosition] = useState("");
  const [nationality, setNationality] = useState("");
  const [currentClub, setCurrentClub] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("newest");

  // Debounce the free-text search so every keystroke doesn't trigger a query.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const buildQuery = useCallback(
    (from: number, to: number) => {
      // Explicit column list (never "*") - public, unauthenticated page;
      // exactly the fields the PlayerRow type above declares, so email
      // (and everything else this page doesn't use) never reaches the
      // browser's network response.
      let query = supabase
        .from("player")
        .select("id, full_name, age, position, nationality, current_club, scoutafrica_id, photo_url, cover_photo_url, verified, slug")
        .range(from, to);

      if (debouncedSearch) {
        query = query.or(
          `full_name.ilike.%${debouncedSearch}%,scoutafrica_id.ilike.%${debouncedSearch}%`
        );
      }
      if (position) query = query.eq("position", position);
      if (nationality.trim()) query = query.ilike("nationality", `%${nationality.trim()}%`);
      if (currentClub.trim()) query = query.ilike("current_club", `%${currentClub.trim()}%`);
      if (minAge) query = query.gte("age", Number(minAge));
      if (maxAge) query = query.lte("age", Number(maxAge));
      if (verifiedOnly) query = query.eq("verified", true);

      switch (sort) {
        case "newest":
          query = query.order("created_at", { ascending: false });
          break;
        case "oldest":
          query = query.order("created_at", { ascending: true });
          break;
        case "alphabetical":
          query = query.order("full_name", { ascending: true });
          break;
        case "age":
          query = query.order("age", { ascending: true });
          break;
      }

      return query;
    },
    [debouncedSearch, position, nationality, currentClub, minAge, maxAge, verifiedOnly, sort]
  );

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setPage(0);

    const { data, error } = await buildQuery(0, PAGE_SIZE - 1);

    if (error) {
      console.error("Failed to load players:", error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setPlayers(data || []);
    setHasMore((data || []).length === PAGE_SIZE);
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await buildQuery(from, to);

    if (error) {
      console.error("Failed to load more players:", error);
      setLoadingMore(false);
      return;
    }

    setPlayers((prev) => [...prev, ...(data || [])]);
    setHasMore((data || []).length === PAGE_SIZE);
    setPage(nextPage);
    setLoadingMore(false);
  }

  function clearFilters() {
    setSearch("");
    setPosition("");
    setNationality("");
    setCurrentClub("");
    setMinAge("");
    setMaxAge("");
    setVerifiedOnly(false);
    setSort("newest");
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-3xl font-bold text-green-700">Find Players</h1>
        <p className="text-gray-500 mt-1 mb-8">
          Discover verified football talent from across Africa.
        </p>

        {/* Search + Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8 space-y-4">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by player name or ScoutAfrica ID..."
              className="w-full rounded-xl border border-gray-200 pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Any Position</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <input
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="Nationality"
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <input
              value={currentClub}
              onChange={(e) => setCurrentClub(e.target.value)}
              placeholder="Current Club"
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="alphabetical">Alphabetical</option>
              <option value="age">Age</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                placeholder="Min age"
                className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="number"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="Max age"
                className="w-24 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              Verified only
            </label>

            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 ml-auto"
            >
              <FiX className="w-3.5 h-3.5" />
              Clear filters
            </button>
          </div>
        </div>

        {/* Results */}
        {loadError ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-500">
            Something went wrong loading players. Please refresh to try again.
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="w-full h-[190px] bg-gray-100 animate-pulse" />
                <div className="flex justify-center -mt-[70px]">
                  <div className="w-[140px] h-[140px] rounded-full border-[5px] border-white bg-gray-200 animate-pulse" />
                </div>
                <div className="px-5 pt-4 pb-5">
                  <div className="h-4 w-2/3 mx-auto bg-gray-100 rounded animate-pulse mb-2" />
                  <div className="h-3 w-1/2 mx-auto bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
            <FiUser className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No players found. Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="bg-white rounded-3xl shadow-sm hover:shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Facebook-style cover photo */}
                  <div className="relative w-full h-[190px] bg-gradient-to-br from-green-100 to-green-50">
                    {player.cover_photo_url ? (
                      <Image src={player.cover_photo_url} alt="" fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FiUser className="w-10 h-10 text-green-200" />
                      </div>
                    )}

                    {/* ScoutAfrica ID, upper-left on the cover */}
                    <span className="absolute top-3 left-3 bg-black/40 backdrop-blur-sm text-white text-xs font-mono font-semibold px-2.5 py-1 rounded-full">
                      {player.scoutafrica_id || "—"}
                    </span>
                  </div>

                  {/* Profile picture, half-overlapping the cover */}
                  <div className="relative flex justify-center -mt-[70px]">
                    <div className="relative w-[140px] h-[140px] rounded-full border-[5px] border-white shadow-md overflow-hidden bg-gray-100">
                      {player.photo_url ? (
                        <Image src={player.photo_url} alt={player.full_name || "Player"} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FiUser className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {player.verified && (
                      <span
                        className="absolute bottom-1 right-[calc(50%-70px+6px)] bg-green-600 text-white rounded-full p-1.5 shadow-md ring-2 ring-white"
                        aria-label="Verified"
                        title="Verified"
                      >
                        <FiCheckCircle className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  {/* Player info, centered */}
                  <div className="px-5 pt-4 pb-5 text-center">
                    <h3 className="font-bold text-gray-900 text-lg truncate">
                      {player.full_name || "Unnamed Player"}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">{player.position || "—"}</p>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mt-0.5">
  <CountryFlag country={player.nationality} />
  <span>{player.nationality || "—"}</span>
</div>
                    <p className="text-sm text-gray-500 truncate">{player.current_club || "Free Agent"}</p>
                    {player.age && <p className="text-sm text-gray-400 mt-1">{player.age} years old</p>}

                    <Link
                      href={`/player-profile/${player.slug || player.id}`}
                      className="mt-5 block w-full text-center bg-green-700 hover:bg-green-800 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      View Profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="bg-white border border-green-600 text-green-700 hover:bg-green-50 font-semibold px-8 py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
