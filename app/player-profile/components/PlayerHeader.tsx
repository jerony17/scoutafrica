"use client";

import Image from "next/image";
import type { Player } from "../../lib/types";
import { CountryFlag } from "../../lib/CountryFlag";

type Props = {
  player: Player;
};

// Same 10-field completeness measure used on Player Dashboard and Find
// Players - kept as one definition rather than a fourth copy.
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

function availabilityStyle(status: Player["availability_status"]) {
  switch (status) {
    case "Available":
      return "bg-green-100 text-green-800 border-green-300";
    case "On Trial":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "In Contract":
      return "bg-gray-100 text-gray-700 border-gray-300";
    default:
      return "bg-gray-100 text-gray-500 border-gray-300";
  }
}

export default function PlayerHeader({ player }: Props) {
  const completion = profileCompletion(player);

  return (
    <div className="mb-10">
      <div className="relative w-full h-64 sm:h-[420px] rounded-2xl overflow-hidden bg-gray-800">
        <Image
          src={player.cover_photo_url || "https://images.unsplash.com/photo-1508098682722-e99c643e7485?w=1200"}
          alt="Cover"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </div>

      <div className="relative px-4 sm:px-10">
        {/* Profile Photo */}
        <div className="-mt-20 sm:-mt-28 flex flex-col sm:flex-row sm:items-end gap-6">
          <div className="relative w-32 h-32 sm:w-56 sm:h-56 rounded-full border-4 border-white overflow-hidden shadow-xl bg-white shrink-0">
            {player.photo_url ? (
              <Image
                src={player.photo_url}
                alt={player.full_name || "Player"}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-sm">
                No Photo
              </div>
            )}
          </div>

          <div className="pb-2 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">
                {player.full_name || "Unnamed Player"}
              </h1>

              {player.verified ? (
                <span className="inline-flex items-center gap-1 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full">
                  Verification Pending
                </span>
              )}

              {player.availability_status && (
                <span
                  className={`inline-flex items-center border text-xs font-semibold px-3 py-1 rounded-full ${availabilityStyle(
                    player.availability_status
                  )}`}
                >
                  {player.availability_status}
                </span>
              )}
            </div>

            <p className="text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm tracking-wide bg-black/5 px-2 py-0.5 rounded">
                {player.scoutafrica_id || "ID pending"}
              </span>
              <span>•</span>
              <span>{player.position || "Position unknown"}</span>
              {player.current_club && (
                <>
                  <span>•</span>
                  <span>{player.current_club}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Key facts strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Nationality</p>
            <p className="font-semibold text-gray-900 flex items-center gap-2 mt-1">
              <CountryFlag country={player.nationality} />
              {player.nationality || "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Age</p>
            <p className="font-semibold text-gray-900 mt-1">{player.age ?? "—"}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Height</p>
            <p className="font-semibold text-gray-900 mt-1">
              {player.height ? `${player.height} cm` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Weight</p>
            <p className="font-semibold text-gray-900 mt-1">
              {player.weight ? `${player.weight} kg` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Preferred Foot</p>
            <p className="font-semibold text-gray-900 mt-1">{player.preferred_foot || "—"}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Profile</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 rounded-full"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="font-semibold text-gray-900 text-sm">{completion}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
