"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import type { Player } from "../lib/types";
import * as Flags from "country-flag-icons/react/3x2";

function getFlag(country: string) {
  const cleanCountry = country.replace(/"/g, "").trim();

  const codes: Record<string, keyof typeof Flags> = {
    Japan: "JP",
    Nigeria: "NG",
    Ghana: "GH",
    Cameroon: "CM",
    "South Africa": "ZA",
  };

  const code = codes[cleanCountry];

  if (!code) return null;

  const Flag = Flags[code];

  return <Flag title={cleanCountry} className="w-6 h-4 rounded-sm inline mr-2" />;
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
        setPlayers(data || []);
      }

      setLoading(false);
    }

    loadPlayers();
  }, [page]);

  if (loading) {
    return <div className="p-10">Loading players...</div>;
  }

  const filteredPlayers = players.filter((player) => {
    const search = searchTerm.toLowerCase();

    const matchesSearch =
      !search ||
      player.full_name?.toLowerCase().includes(search) ||
      player.scoutafrica_id?.toLowerCase().includes(search);

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

    return matchesSearch && matchesPosition && matchesNation && matchesAge;
  });

  return (
    <main className="max-w-6xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">
        Find Players
      </h1>  
  <div className="mb-10 bg-white rounded-2xl shadow-lg border border-gray-200 p-6">

  <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
    🔍 Find Your Next Star
  </h2>

  <p className="text-gray-500 mt-2 mb-6">
    Search by player name, ScoutAfrica ID, nationality or club.
  </p>

  {/* Search */}
  <div className="relative mb-6">
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
      🔍
    </span>

    <input
      type="text"
      placeholder="Search players..."
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="w-full rounded-xl border border-gray-300 py-4 pl-12 pr-4 text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
    />
  </div>

  {/* Filters */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

    <select
      value={positionFilter}
      onChange={(e) => setPositionFilter(e.target.value)}
      className="rounded-xl border border-gray-300 p-4 shadow-sm focus:ring-2 focus:ring-green-600"
    >
      <option>Position</option>
      <option>Goalkeeper</option>
      <option>Defender</option>
      <option>Midfielder</option>
      <option>Forward</option>
    </select>

    <select
      value={nationFilter}
      onChange={(e) => setNationFilter(e.target.value)}
      className="rounded-xl border border-gray-300 p-4 shadow-sm focus:ring-2 focus:ring-green-600"
    >
      <option>Nation</option>
      <option>Nigeria</option>
      <option>Japan</option>
      <option>Ghana</option>
      <option>South Africa</option>
      <option>Cameroon</option>
    </select>

    <select
      value={ageFilter}
      onChange={(e) => setAgeFilter(e.target.value)}
      className="rounded-xl border border-gray-300 p-4 shadow-sm focus:ring-2 focus:ring-green-600"
    >
      <option>Age</option>
      <option>Under 18</option>
      <option>18–21</option>
      <option>22–25</option>
      <option>26+</option>
    </select>

  </div>

  {(positionFilter !== "Position" ||
    nationFilter !== "Nation" ||
    ageFilter !== "Age" ||
    searchTerm) && (
    <button
      onClick={() => {
        setPositionFilter("Position");
        setNationFilter("Nation");
        setAgeFilter("Age");
        setSearchTerm("");
      }}
      className="mt-4 text-sm text-green-700 underline"
    >
      Clear filters
    </button>
  )}

</div>
      {filteredPlayers.length === 0 && (
        <p className="text-center text-gray-500 py-16">
          No players match your filters. Try adjusting or clearing them.
        </p>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {filteredPlayers.map((player) => (
          <div
  key={player.id}
  className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition duration-300"
>

  <img
    src={
      player.photo_url ||
      "https://placehold.co/600x400?text=ScoutAfrica+Player"
    }
    alt={player.full_name}
    className="w-full h-56 object-cover"
  />

  <div className="p-5">

    <div className="flex justify-between items-center">
      <h2 className="text-xl font-bold">
        {player.full_name}
      </h2>

      {player.verified && (
  <span className="text-green-600 text-xl">
    ✓
  </span>
)}
    </div>

    <p className="text-gray-600 mt-2">
      ⚽ {player.position}
    </p>

    <p className="text-gray-600">
      {getFlag(player.nationality)}
<span className="ml-2">{player.nationality}</span>
    </p>

    <p className="text-gray-600">
      🎂 Age {player.age}
    </p>

    <p className="text-gray-600">
      🏟 {player.current_club}
    </p>

    <p className="text-green-700 font-semibold mt-3">
      ScoutAfrica ID:
{player.scoutafrica_id}
    </p>

    {player.slug ? (
      <Link
        href={`/player-profile/${player.slug}`}
        className="block w-full mt-5 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl text-center font-semibold"
      >
        View Profile
      </Link>
    ) : (
      <button
        disabled
        title="This player's profile isn't available yet"
        className="block w-full mt-5 bg-gray-300 text-gray-500 py-3 rounded-xl text-center font-semibold cursor-not-allowed"
      >
        Profile Unavailable
      </button>
    )}

  </div>

</div>
        ))}
      </div> 
<div className="flex justify-center mt-10">
  <button
    onClick={() => setPage(page + 1)}
    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold"
  >
    Load More
  </button>
</div>

    </main>
  );
}