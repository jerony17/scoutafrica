"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isFounderProfile } from "../lib/types";
import type { FounderProfile } from "../lib/types";
import { FiCheckCircle, FiStar, FiUser, FiShield } from "react-icons/fi"; 
import type { ComponentType } from "react";

// Sidebar-style executive profile card, matching the approved reference
// exactly. Still fully dynamic - name/position/company/country/base/
// photo/quote source all come from the real founder_profile table.
//
// Flag icons: rendered from the country NAME (profile.country /
// profile.current_base), not the country_flag column - that column is
// what was rendering as unreadable text/tofu in the first place, so it
// isn't used here anymore. Small inline SVGs, not a new package
// dependency (couldn't verify react-country-flag or flag-icons are
// actually installed from this environment, so avoided the risk).
//
// Three fields shown in the reference have no corresponding column yet
// (per explicit instruction: no migration, use fallbacks, decide later):
// the quote text, the "Read My Story" link target, and "Former
// Professional Footballer" as a bio fact.
const FALLBACK_QUOTE =
  "Building the bridge between African football talent and the opportunities that talent deserves.";
const FALLBACK_STORY_HREF = "#our-story";
const FALLBACK_BIO_FACTS = ["Former Professional Footballer"];

function NigeriaFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 3 2" className={className} aria-hidden="true">
      <rect width="1" height="2" fill="#008751" />
      <rect x="1" width="1" height="2" fill="#ffffff" />
      <rect x="2" width="1" height="2" fill="#008751" />
    </svg>
  );
}

function JapanFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 3 2" className={className} aria-hidden="true">
      <rect width="3" height="2" fill="#ffffff" />
      <circle cx="1.5" cy="1" r="0.6" fill="#bc002d" />
    </svg>
  );
}

const FLAGS: Record<string, ComponentType<{ className?: string }>> = {
  nigeria: NigeriaFlag,
  japan: JapanFlag,
};

function FlagIcon({ country, className }: { country: string; className?: string }) {
  const Flag = FLAGS[country.trim().toLowerCase()];
  if (!Flag) return null;
  return <Flag className={className} />;
}

export default function FounderSection() {
  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase.from("founder_profile").select("*").eq("id", 1).single();

      if (error || !isFounderProfile(data)) {
        console.error("Failed to load founder profile:", error);
        setLoadError(true);
        setLoading(false);
        return;
      }

      setProfile(data);
      setLoading(false);
    }

    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="lg:w-[300px] shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="h-64 bg-gray-50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError || !profile) {
    return null;
  }

  const bioFacts = [
    ...FALLBACK_BIO_FACTS,
    `Founder of ${profile.company}`,
    "Verified Founder",
  ];

  return (
    <aside className="lg:w-[300px] shrink-0">
      <div className="lg:sticky lg:top-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        {/* Centered block: badge pill, portrait, name, position, country/base */}
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <FiCheckCircle className="w-3.5 h-3.5" />
            {profile.position}
          </div>

          <div className="mb-5">
              
              <div className="relative w-[220px] h-[220px]">
  <Image
    src="/branding/founder-jerome-abah-final.png"
    alt="Jerome Abah"
    fill
    priority
    className="object-contain"
  />
</div>
          </div>

          <h2 className="text-xl font-bold text-gray-900">{profile.full_name}</h2>
          <p className="text-green-700 font-semibold text-sm mt-0.5">{profile.position}</p>

          <div className="flex flex-col items-center gap-1.5 mt-4 text-sm text-gray-600">
            {profile.country && (
              <span className="flex items-center gap-2">
                <FlagIcon country={profile.country} className="w-4 h-3 rounded-sm shrink-0" />
                {profile.country}
              </span>
            )}
            {profile.current_base && (
              <span className="flex items-center gap-2">
                <FlagIcon country={profile.current_base} className="w-4 h-3 rounded-sm shrink-0" />
                Based in {profile.current_base}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 my-5" />

        {/* Left-aligned block: bio facts, quote, Read My Story - unchanged */}
        <ul className="space-y-2.5 text-sm text-gray-700">
          {bioFacts.map((fact, i) => (
            <li key={fact} className="flex items-center gap-2.5">
              {i === 0 && <FiStar className="w-4 h-4 text-green-600 shrink-0" />}
              {i === 1 && <FiUser className="w-4 h-4 text-green-600 shrink-0" />}
              {i === 2 && <FiShield className="w-4 h-4 text-green-600 shrink-0" />}
              {fact}
            </li>
          ))}
        </ul>

        <div className="border-t border-gray-100 my-5" />

        <blockquote className="text-gray-600 text-sm italic leading-relaxed">
          &ldquo;{FALLBACK_QUOTE}&rdquo;
        </blockquote>
        <a
          href={FALLBACK_STORY_HREF}
          className="inline-flex items-center gap-1 text-green-700 text-sm font-semibold mt-4 hover:text-green-800"
        >
          Read My Story →
        </a>
      </div>
    </aside>
  );
}
