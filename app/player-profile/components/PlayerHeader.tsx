"use client";

import Image from "next/image";
import type { Player } from "../../lib/types";
import { CountryFlag } from "../../lib/CountryFlag";
import PremiumBadge from "../../components/PremiumBadge"; 
import Link from "next/link";
import { FaEdit } from "react-icons/fa";

type Props = {
  player: Player;
  isOwnProfile?: boolean;
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

export default function PlayerHeader({ player, isOwnProfile }: Props) {
  const completion = profileCompletion(player);

  return (
    <div className="mb-10 animate-fade-in">
      
      <div className="relative w-full h-[220px] sm:h-[280px] lg:h-[340px] rounded-2xl overflow-hidden bg-gray-800 shadow-lg ring-1 ring-black/5">
          <Image
  src={player.cover_photo_url || "/images/default-cover.jpg"}
  alt="Cover"
  fill
  className="object-cover"
  priority
/>
          
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      </div>

      <div className="relative px-4 sm:px-6 lg:px-10">
        {/* Profile Photo */}
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div
  className="relative w-36 h-36 sm:w-44 sm:h-44 lg:w-[180px] lg:h-[180px] -mt-[90px] rounded-full border-4 border-white overflow-hidden"
>
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

          <div className="pb-2 flex-1 w-full text-center md:text-left">
            <div className="flex flex-wrap items-center gap-3">
             <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight break-words">

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

              <PremiumBadge userId={player.user_id} />

              {player.availability_status && (
                <span
                  className={`inline-flex items-center border text-xs font-semibold px-3 py-1 rounded-full ${availabilityStyle(
                    player.availability_status
                  )}`}
                >
                  {player.availability_status}
                </span>
              )}

              <span className="font-mono text-xs tracking-wide bg-black/5 text-gray-500 px-2 py-1 rounded">
                {player.scoutafrica_id || "ID pending"}
              </span>
            </div>

            <div className="mt-2 space-y-1">
              <p className="text-gray-700 font-medium flex items-center gap-2">
                <CountryFlag country={player.nationality} />
                {player.nationality || "Nationality unknown"}
              </p>
              <p className="text-gray-700 font-medium flex items-center gap-2">
                ⚽ {player.position || "Position unknown"}
              </p>
              {player.current_club && (
                <p className="text-gray-500 text-sm">{player.current_club}</p>
              )}
            </div>
          </div>
        </div>
         

          <div className="mt-5 flex flex-wrap gap-3">
            {isOwnProfile && (
  <Link
    href="/edit-profile"
    className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 font-medium px-5 py-2.5 rounded-xl transition-all"
  >
    <FaEdit className="w-4 h-4" />
    Edit Profile
  </Link>
)}
  <button
    onClick={async () => {
      const shareData = {
        title: player.full_name || "ScoutAfrica Player",
        text: `Check out ${player.full_name}'s ScoutAfrica profile.`,
        url: window.location.href,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch {
          // User cancelled sharing
        }
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("✅ Profile link copied to clipboard!");
      }
    }}
    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl transition-all"
  >
    🔗 Share Profile
  </button>
</div>

        {/* Key facts strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-8">
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Nationality</p>
            <p className="font-semibold text-gray-900 flex items-center gap-2 mt-1">
              <CountryFlag country={player.nationality} />
              {player.nationality || "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Age</p>
            <p className="font-semibold text-gray-900 mt-1">{player.age ?? "—"}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Height</p>
            <p className="font-semibold text-gray-900 mt-1">
              {player.height ? `${player.height} cm` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Weight</p>
            <p className="font-semibold text-gray-900 mt-1">
              {player.weight ? `${player.weight} kg` : "—"}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Preferred Foot</p>
            <p className="font-semibold text-gray-900 mt-1">{player.preferred_foot || "—"}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md p-4 transition-all duration-200 hover:-translate-y-0.5 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Profile</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all duration-500"
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
