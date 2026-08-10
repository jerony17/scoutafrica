"use client"; 

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isPlayer } from "../lib/types";
import type { Player, CareerHistory } from "../lib/types";

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

export default function EditProfile() {
  const [player, setPlayer] = useState<Player | null>(null);   
  const [careerHistory, setCareerHistory] = useState<CareerHistory[]>([]);
  const [savingCareerIndex, setSavingCareerIndex] = useState<number | null>(null);
  const [deletingCareerIndex, setDeletingCareerIndex] = useState<number | null>(null);
  const [addingCareer, setAddingCareer] = useState(false);

  // Field names match the real career_history columns exactly - no
  // schema changes, no renamed columns.
  const [newCareer, setNewCareer] = useState({
    club_name: "",
    country: "",
    league: "",
    position: "",
    year: "",
    appearances: 0,
    goals: 0,
    assists: 0,
  });

  const [selectedProfilePhoto, setSelectedProfilePhoto] = useState<File | null>(null);
  const [selectedCoverPhoto, setSelectedCoverPhoto] = useState<File | null>(null);

  async function loadPlayer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("player")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data && isPlayer(data)) {
      setPlayer(data);
    }
  }

  useEffect(() => {
    loadPlayer();
  }, []);

  useEffect(() => {
    if (player) {
      loadCareerHistory();
    }
  }, [player]);

  async function loadCareerHistory() {
    if (!player) return;

    const { data, error } = await supabase
      .from("career_history")
      .select("*")
      .eq("player_id", player.id)
      .order("display_order", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setCareerHistory(data || []);
  }

  async function addCareerEntry() {
    if (!player) return;
    if (!newCareer.club_name.trim()) {
      alert("Please enter a club name before adding this entry.");
      return;
    }

    setAddingCareer(true);

    const { error } = await supabase.from("career_history").insert({
      player_id: player.id,
      club_name: newCareer.club_name,
      country: newCareer.country || null,
      league: newCareer.league || null,
      position: newCareer.position || null,
      year: newCareer.year || null,
      appearances: newCareer.appearances,
      goals: newCareer.goals,
      assists: newCareer.assists,
      display_order: careerHistory.length,
    });

    setAddingCareer(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setNewCareer({
      club_name: "",
      country: "",
      league: "",
      position: "",
      year: "",
      appearances: 0,
      goals: 0,
      assists: 0,
    });

    await loadCareerHistory();
  }

  async function saveCareerEntry(index: number) {
    const entry = careerHistory[index];
    if (!entry) return;

    setSavingCareerIndex(index);

    const { error } = await supabase
      .from("career_history")
      .update({
        club_name: entry.club_name,
        country: entry.country,
        league: entry.league,
        position: entry.position,
        year: entry.year,
        appearances: entry.appearances,
        goals: entry.goals,
        assists: entry.assists,
      })
      .eq("id", entry.id);

    setSavingCareerIndex(null);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }
  }

  // New: real delete, matching the "Users can delete own career
  // history" RLS policy that already exists on this table.
  async function deleteCareerEntry(index: number) {
    const entry = careerHistory[index];
    if (!entry) return;

    if (!confirm(`Remove ${entry.club_name || "this club"} from your career history?`)) {
      return;
    }

    setDeletingCareerIndex(index);

    const { error } = await supabase
      .from("career_history")
      .delete()
      .eq("id", entry.id);

    setDeletingCareerIndex(null);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setCareerHistory((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveProfile() {
    if (!player) return;

    const { error } = await supabase
      .from("player")
      .update({
        full_name: player.full_name,
        position: player.position,
        secondary_position: player.secondary_position,
        current_club: player.current_club,
        nationality: player.nationality,
        photo_url: player.photo_url,
        date_of_birth: player.date_of_birth,
        height: player.height,
        weight: player.weight,
        preferred_foot: player.preferred_foot,
        contract_expiry: player.contract_expiry,
        bio: player.bio,
        playing_style: player.playing_style,
        matches: player.matches,
        goals: player.goals,
        assists: player.assists,
        minutes_played: player.minutes_played,
        clean_sheets: player.clean_sheets,
        yellow_cards: player.yellow_cards,
        red_card: player.red_card,
      })
      .eq("id", player.id)
      .select();

    if (error) {
      alert(error.message);
    } else {
      await loadPlayer();
      alert("Profile updated successfully!");
    }
  }

  async function uploadProfilePhoto() {
    if (!selectedProfilePhoto || !player) return;

    const fileName = `profile-${player.id}-${Date.now()}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, selectedProfilePhoto, {
        upsert: true,
      });

    if (uploadError) {
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(fileName);

    const imageUrl = data.publicUrl;

    const { error: updateError } = await supabase
      .from("player")
      .update({
        photo_url: imageUrl,
      })
      .eq("id", player.id);

    if (updateError) {
      console.error(updateError);
      alert(JSON.stringify(updateError));
      return;
    }

    setPlayer({
      ...player,
      photo_url: imageUrl,
    });
    alert("Profile photo uploaded!");
  }

  async function uploadCoverPhoto() {
    if (!selectedCoverPhoto || !player) return;

    const fileName = `cover-${player.id}-${Date.now()}`;

    const { error: uploadError } = await supabase.storage
      .from("cover-photos")
      .upload(fileName, selectedCoverPhoto, {
        upsert: true,
      });

    if (uploadError) {
      console.error(uploadError);
      alert(JSON.stringify(uploadError));
      return;
    }

    const { data } = supabase.storage
      .from("cover-photos")
      .getPublicUrl(fileName);

    const imageUrl = data.publicUrl;

    const { error: updateError } = await supabase
      .from("player")
      .update({
        cover_photo_url: imageUrl,
      })
      .eq("id", player.id);

    if (updateError) {
      console.error(updateError);
      alert(JSON.stringify(updateError));
      return;
    }

    setPlayer({
      ...player,
      cover_photo_url: imageUrl,
    });

    alert("Cover photo uploaded!");
  }

  if (!player) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        Loading...
      </div>
    );
  }

  const inputClass = "w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";

  return (
    <main className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8">

        <h1 className="text-4xl font-bold text-green-700 mb-8">
          Edit Profile
        </h1>
        <div className="mb-8">
          <div className="relative h-64 w-full rounded-2xl overflow-hidden bg-gray-300">

            <Image
              src={
                player.cover_photo_url ||
                "https://images.unsplash.com/photo-1508098682722-e99c643e7485?w=1200"
              }
              alt="Cover"
              fill
              className="object-cover"
            />

            <div className="absolute bottom-4 right-4 flex gap-2">

              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setSelectedCoverPhoto(
                    e.target.files ? e.target.files[0] : null
                  )
                }
              />

              <button
                onClick={uploadCoverPhoto}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Upload Cover
              </button>

            </div>

          </div>
        </div>

        <div className="mb-8 flex items-center gap-6">
          <Image
            src={
              player.photo_url ||
              "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400"
            }
            alt="Profile"
            width={112}
            height={112}
            className="h-28 w-28 rounded-full object-cover bg-gray-300 border-4 border-white shadow"
          />

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setSelectedProfilePhoto(
                  e.target.files ? e.target.files[0] : null
                )
              }
            />

            <button
              onClick={uploadProfilePhoto}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            >
              Upload Profile Photo
            </button>
          </div>
        </div>

        <div className="space-y-5">

          <input
            className="w-full border rounded-lg p-3"
            value={player.full_name || ""}
            onChange={(e) =>
              setPlayer({ ...player, full_name: e.target.value })
            }
            placeholder="Full Name"
          />

          <input
            className="w-full border rounded-lg p-3"
            value={player.position ?? ""}
            onChange={(e) =>
              setPlayer({ ...player, position: e.target.value })
            }
            placeholder="Position"
          />

          <div>
            <label className="font-medium block mb-1.5">Secondary Position</label>
            <select
              className="w-full border rounded-lg p-3 bg-white"
              value={player.secondary_position ?? ""}
              onChange={(e) =>
                setPlayer({ ...player, secondary_position: e.target.value })
              }
            >
              <option value="">Select secondary position...</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <input
            className="w-full border rounded-lg p-3"
            value={player.current_club ?? ""}
            onChange={(e) =>
              setPlayer({ ...player, current_club: e.target.value })
            }
            placeholder="Current Club"
          />

          <input
            className="w-full border rounded-lg p-3"
            value={player.nationality ?? ""}
            onChange={(e) =>
              setPlayer({ ...player, nationality: e.target.value })
            }
            placeholder="Nationality"
          />

          <input
            className="w-full border rounded-lg p-3"
            type="number"
            value={player.height || ""}
            onChange={(e) =>
              setPlayer({
                ...player,
                height: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="Height"
          />

          <input
            className="w-full border rounded-lg p-3"
            type="number"
            value={player.weight || ""}
            onChange={(e) =>
              setPlayer({
                ...player,
                weight: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            placeholder="Weight"
          />

          <input
            className="w-full border rounded-lg p-3"
            value={player.preferred_foot || ""}
            onChange={(e) =>
              setPlayer({ ...player, preferred_foot: e.target.value })
            }
            placeholder="Preferred Foot"
          />

          <label className="font-medium">Date of Birth</label>
          <input
            className="w-full border rounded-lg p-3"
            type="date"
            value={player.date_of_birth || ""}
            onChange={(e) =>
              setPlayer({ ...player, date_of_birth: e.target.value })
            }
            placeholder="Date of Birth"
          />

          <label className="font-medium">Contract Expiry</label>
          <input
            className="w-full border rounded-lg p-3"
            type="date"
            value={player.contract_expiry || ""}
            onChange={(e) =>
              setPlayer({ ...player, contract_expiry: e.target.value })
            }
          />

          <textarea
            className="w-full border rounded-lg p-3 h-40"
            value={player.bio || ""}
            onChange={(e) =>
              setPlayer({ ...player, bio: e.target.value })
            }
            placeholder="Biography"
          />

          <div>
            <label className="font-medium block mb-1.5">Playing Style</label>
            <textarea
              className="w-full border rounded-lg p-3 h-32"
              value={player.playing_style || ""}
              onChange={(e) =>
                setPlayer({ ...player, playing_style: e.target.value })
              }
              placeholder="Describe your playing style..."
            />
          </div>

          {/* ================= Season Statistics ================= */}
          <div className="mt-2">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Season Statistics</h2>
            <p className="text-sm text-gray-500 mb-5">
              These numbers appear on your public player profile.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Matches
                </label>
                <input
  className="w-full border rounded-lg p-3 text-center"
  type="number"
  min="0"
  value={player.matches ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, matches: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Goals
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number" 
                  min="0"
                  value={player.goals ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, goals: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Assists
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number" 
                   min="0"
                  value={player.assists ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, assists: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Minutes Played
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number" 
                   min="0"
                  value={player.minutes_played ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, minutes_played: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Clean Sheets
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number" 
                   min="0"
                  value={player.clean_sheets ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, clean_sheets: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Yellow Cards
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number"
                   min="0"
                  value={player.yellow_cards ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, yellow_cards: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Red Cards
                </label>
                <input
                  className="w-full border rounded-lg p-3 text-center"
                  type="number" 
                  min="0"
                  value={player.red_card ?? ""}
                  onChange={(e) =>
                    setPlayer({ ...player, red_card: e.target.value === "" ? 0 : Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          {/* ================= Career History ================= */}

          <div className="mt-10">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-bold text-gray-900">Career History</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Build your professional football CV - clubs, academies, and teams you&apos;ve represented.
            </p>

            {careerHistory.length === 0 && (
              <p className="text-gray-400 text-sm mb-6">
                No career history yet. Add your first club below.
              </p>
            )}

            <div className="space-y-5">
              {careerHistory.map((career, index) => (
                <div
                  key={career.id ?? index}
                  className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-300 p-6"
                >
                  <div className="grid sm:grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Club Name
                      </label>
                      <input
                        className={inputClass}
                        placeholder="e.g. FC Bombonera Gifu"
                        value={career.club_name}
                        onChange={(e) => {
                          const updated = [...careerHistory];
                          updated[index].club_name = e.target.value;
                          setCareerHistory(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Country
                      </label>
                      <input
                        className={inputClass}
                        placeholder="Country"
                        value={career.country ?? ""}
                        onChange={(e) => {
                          const updated = [...careerHistory];
                          updated[index].country = e.target.value;
                          setCareerHistory(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        League
                      </label>
                      <input
                        className={inputClass}
                        placeholder="League"
                        value={career.league ?? ""}
                        onChange={(e) => {
                          const updated = [...careerHistory];
                          updated[index].league = e.target.value;
                          setCareerHistory(updated);
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Position
                      </label>
                      <select
                        className={inputClass + " bg-white"}
                        value={career.position ?? ""}
                        onChange={(e) => {
                          const updated = [...careerHistory];
                          updated[index].position = e.target.value;
                          setCareerHistory(updated);
                        }}
                      >
                        <option value="">Select position...</option>
                        {POSITIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                        Year
                      </label>
                      <input
                        className={inputClass}
                        placeholder="e.g. 2024-2025"
                        value={career.year ?? ""}
                        onChange={(e) => {
                          const updated = [...careerHistory];
                          updated[index].year = e.target.value;
                          setCareerHistory(updated);
                        }}
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 mb-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Player Statistics
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Appearances</label>
                        <input
                          className={inputClass + " text-center"}
                          type="number"
                          value={career.appearances ?? 0}
                          onChange={(e) => {
                            const updated = [...careerHistory];
                            updated[index].appearances = e.target.value === "" ? 0 : Number(e.target.value);
                            setCareerHistory(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Goals</label>
                        <input
                          className={inputClass + " text-center"}
                          type="number"
                          value={career.goals ?? 0}
                          onChange={(e) => {
                            const updated = [...careerHistory];
                            updated[index].goals = e.target.value === "" ? 0 : Number(e.target.value);
                            setCareerHistory(updated);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Assists</label>
                        <input
                          className={inputClass + " text-center"}
                          type="number"
                          value={career.assists ?? 0}
                          onChange={(e) => {
                            const updated = [...careerHistory];
                            updated[index].assists = e.target.value === "" ? 0 : Number(e.target.value);
                            setCareerHistory(updated);
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => saveCareerEntry(index)}
                      disabled={savingCareerIndex === index}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {savingCareerIndex === index ? "Saving..." : "💾 Save Changes"}
                    </button>
                    <button
                      onClick={() => deleteCareerEntry(index)}
                      disabled={deletingCareerIndex === index}
                      className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {deletingCareerIndex === index ? "Removing..." : "🗑 Delete Club"}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Another Club */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-200 p-6 mt-5">
              <h3 className="font-bold text-gray-900 mb-4">Add Another Club</h3>

              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Club Name
                  </label>
                  <input
                    className={inputClass}
                    placeholder="e.g. FC Bombonera Gifu"
                    value={newCareer.club_name}
                    onChange={(e) => setNewCareer({ ...newCareer, club_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Country
                  </label>
                  <input
                    className={inputClass}
                    placeholder="Country"
                    value={newCareer.country}
                    onChange={(e) => setNewCareer({ ...newCareer, country: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    League
                  </label>
                  <input
                    className={inputClass}
                    placeholder="League"
                    value={newCareer.league}
                    onChange={(e) => setNewCareer({ ...newCareer, league: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Position
                  </label>
                  <select
                    className={inputClass + " bg-white"}
                    value={newCareer.position}
                    onChange={(e) => setNewCareer({ ...newCareer, position: e.target.value })}
                  >
                    <option value="">Select position...</option>
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Year
                  </label>
                  <input
                    className={inputClass}
                    placeholder="e.g. 2024-2025"
                    value={newCareer.year}
                    onChange={(e) => setNewCareer({ ...newCareer, year: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Player Statistics
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Appearances</label>
                    <input
                      className={inputClass + " text-center"}
                      type="number"
                      value={newCareer.appearances}
                      onChange={(e) =>
                        setNewCareer({ ...newCareer, appearances: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Goals</label>
                    <input
                      className={inputClass + " text-center"}
                      type="number"
                      value={newCareer.goals}
                      onChange={(e) =>
                        setNewCareer({ ...newCareer, goals: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Assists</label>
                    <input
                      className={inputClass + " text-center"}
                      type="number"
                      value={newCareer.assists}
                      onChange={(e) =>
                        setNewCareer({ ...newCareer, assists: e.target.value === "" ? 0 : Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>

              <button
                onClick={addCareerEntry}
                disabled={addingCareer}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                {addingCareer ? "Adding..." : "➕ Add Another Club"}
              </button>
            </div>
          </div>

          <button
            onClick={saveProfile}
            className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold"
          >
            Save Profile
          </button>

        </div>

      </div>

    </main>
  );
}
