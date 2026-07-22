"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { CareerHistoryEntry, Player } from "../../lib/types";

export default function CareerHistory() { 
  const [showModal, setShowModal] = useState(false);

  const [clubName, setClubName] = useState("");
  const [year, setYear] = useState("");
  const [league, setLeague] = useState("");
  const [country, setCountry] = useState("");
  const [position, setPosition] = useState("");
  const [appearances, setAppearances] = useState("");
  const [goals, setGoals] = useState("");
  const [assists, setAssists] = useState(""); 
  const [player, setPlayer] = useState<Player | null>(null);
const [careerHistory, setCareerHistory] = useState<CareerHistoryEntry[]>([]); 

async function loadCareerHistory(playerId: number) {
  const { data, error } = await supabase
    .from("career_history")
    .select("*")
    .eq("player_id", playerId)
    .returns<CareerHistoryEntry[]>();

  if (error) {
    console.error(error);
  }

  if (data) {
    setCareerHistory(data);
  }
}

useEffect(() => {
  async function loadPlayer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("player")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .returns<Player>();

    if (data) {
      setPlayer(data);
      loadCareerHistory(data.id);
    }
  }

  loadPlayer();
}, []);

  async function saveCareer() {
    if (!player) {
  alert("Player profile not found");
  return;
}

const player_id = player.id;

    const { error } = await supabase.from("career_history").insert([
      {
        player_id,
        club_name: clubName,
        year,
        league,
        country,
        position,
        appearances: Number(appearances),
        goals: Number(goals),
        assists: Number(assists),
        display_order: 0,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Career history saved!");

    setClubName("");
    setYear("");
    setLeague("");
    setCountry("");
    setPosition("");
    setAppearances("");
    setGoals("");
    setAssists("");

    setShowModal(false);
  }

  return (
    <div className="min-h-screen bg-gray-100 p-10">

      <div className="max-w-5xl mx-auto">

        <div className="flex justify-between items-center mb-10">

          <h1 className="text-5xl font-bold">
            Career History
          </h1>

          <button
            onClick={() => setShowModal(true)}
            className="bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700"
          >
            + Add Club
          </button>

        </div>

        {careerHistory.length === 0 ? (

  <div className="bg-white rounded-3xl shadow-xl p-12 text-center">
    <h2 className="text-3xl font-bold">
      No Career History Yet
    </h2>

    <p className="text-gray-500 mt-3">
      Click &quot;Add Club&quot; to start building your football career.
    </p>
  </div>

) : (

  <div className="space-y-6">

    {careerHistory.map((club) => (

      <div
        key={club.id}
        className="bg-white rounded-3xl shadow-xl p-8"
      >

        <h2 className="text-2xl font-bold text-green-700">
          {club.club_name}
        </h2>

        <p><strong>Year:</strong> {club.year}</p>

        <p><strong>League:</strong> {club.league}</p>

        <p><strong>Country:</strong> {club.country}</p>

        <p><strong>Position:</strong> {club.position}</p>

        <div className="grid grid-cols-3 gap-4 mt-6">

          <div className="bg-green-100 rounded-xl p-4 text-center">
            <h3>Appearances</h3>
            <p className="text-3xl font-bold">
              {club.appearances}
            </p>
          </div>

          <div className="bg-green-100 rounded-xl p-4 text-center">
            <h3>Goals</h3>
            <p className="text-3xl font-bold">
              {club.goals}
            </p>
          </div>

          <div className="bg-green-100 rounded-xl p-4 text-center">
            <h3>Assists</h3>
            <p className="text-3xl font-bold">
              {club.assists}
            </p>
          </div>

        </div>

      </div>

    ))}

  </div>

)}

      </div>

      {showModal && (

        <div className="fixed inset-0 bg-black/50 flex justify-center items-center">

          <div className="bg-white rounded-3xl p-10 w-full max-w-2xl">

            <h2 className="text-3xl font-bold mb-8">
              Add Career History
            </h2>

            <div className="grid grid-cols-2 gap-4">

              <input
                placeholder="Club Name"
                className="border p-3 rounded-xl"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
              />

              <input
                placeholder="Year"
                className="border p-3 rounded-xl"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />

              <input
                placeholder="League"
                className="border p-3 rounded-xl"
                value={league}
                onChange={(e) => setLeague(e.target.value)}
              />

              <input
                placeholder="Country"
                className="border p-3 rounded-xl"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />

              <input
                placeholder="Position"
                className="border p-3 rounded-xl"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />

              <input
                placeholder="Appearances"
                className="border p-3 rounded-xl"
                value={appearances}
                onChange={(e) => setAppearances(e.target.value)}
              />

              <input
                placeholder="Goals"
                className="border p-3 rounded-xl"
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
              />

              <input
                placeholder="Assists"
                className="border p-3 rounded-xl"
                value={assists}
                onChange={(e) => setAssists(e.target.value)}
              />

            </div>

            <div className="flex justify-end gap-4 mt-10">

              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-3 rounded-xl bg-gray-300"
              >
                Cancel
              </button>

              <button
                onClick={saveCareer}
                className="px-6 py-3 rounded-xl bg-green-600 text-white"
              >
                Save Club
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}