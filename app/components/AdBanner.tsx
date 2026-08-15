"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isArrayOf, isAdvertisement } from "../lib/types";
import type { Advertisement, AdPlacement } from "../lib/types";

type Props = {
  placement: AdPlacement;
};

// Displays one currently-active advertisement for the given placement.
// RLS (035_advertising_system) already restricts what this can even see
// to status = 'Active' ads within their start/end date.
export default function AdBanner({ placement }: Props) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const trackedImpression = useRef(false);

  useEffect(() => {
    async function loadAd() {
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .in("placement", [placement, "All Website"]);

      if (error) {
        console.error("AdBanner: failed to load ad:", error);
        return;
      }

      const candidates = isArrayOf(data, isAdvertisement)
        ? data
        : [];

      if (candidates.length === 0) return;

      const chosen =
        candidates[Math.floor(Math.random() * candidates.length)];

      setAd(chosen);
    }

    loadAd();
  }, [placement]);

  useEffect(() => {
    if (!ad || trackedImpression.current) return;

    trackedImpression.current = true;

    supabase
      .rpc("increment_ad_impression", {
        p_ad_id: ad.id,
      })
      .then(({ error }) => {
        if (error) {
          console.error(
            "AdBanner: failed to record impression:",
            error
          );
        }
      });
  }, [ad]);

  if (!ad) return null;

function handleClick() {
  if (!ad) return;

  supabase
    .rpc("increment_ad_click", {
      p_ad_id: ad.id,
    })
    .then(({ error }) => {
      if (error) {
        console.error(
          "AdBanner: failed to record click:",
          error
        );
      }
    });
}

  return (
    <a
      href={ad.destination_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      onClick={handleClick}
      className="block rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {ad.image_url ? (
        <Image
          src={ad.image_url}
          alt={ad.title}
          width={728}
          height={200}
          className="w-full h-auto object-cover"
        />
      ) : (
        <div className="bg-gray-100 p-6 text-center">
          <p className="font-semibold text-gray-800">
            {ad.title}
          </p>

          {ad.description && (
            <p className="text-sm text-gray-500 mt-1">
              {ad.description}
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-right px-2 py-1">
        Advertisement · {ad.advertiser_name}
      </p>
    </a>
  );
}