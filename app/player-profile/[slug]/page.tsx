"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Player, VideoRecord } from "../../lib/types";

import PlayerHeader from "../components/PlayerHeader";
import PlayerStats from "../components/PlayerStats";
import SeasonStats from "../components/SeasonStats";
import CareerHistory from "../components/CareerHistory";
import ScoutOverview from "../components/ScoutOverview";
import HighlightVideos from "../components/HighlightVideos";
import VideoUpload from "../components/VideoUpload";
import PlayerIDCard from "../components/PlayerIDCard";

export default function PlayerProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Player | null>(null);

  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingWatchlist, setSavingWatchlist] = useState(false); 
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    async function loadPlayer() {
      const { data, error } = await supabase
        .from("player")
        .select("*")
        .eq("slug", slug)
        .single()
        .returns<Player>();

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }

      setPlayer(data);

      const { data: playerVideos } = await supabase
        .from("videos")
        .select("*")
        .eq("player_id", data.user_id || "")
        .order("created_at", { ascending: false })
        .returns<VideoRecord[]>();

      setVideos(playerVideos || []);

      setLoading(false);
    }

    loadPlayer();
  }, [slug, reloadIndex]);

  async function addToWatchlist(playerId: number) {
    setSavingWatchlist(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      alert("Please sign in as a scout.");
      setSavingWatchlist(false);
      return;
    }

    const { error } = await supabase.from("watchlist").insert({
      scout_id: user.id,
      player_id: playerId,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("⭐ Player added to Watchlist!");
    }

    setSavingWatchlist(false);
  }

  async function uploadVideo() {
    if (!selectedVideo || !player || !player.user_id) return;

    setUploading(true);

    const fileName = `${Date.now()}-${selectedVideo.name}`;

    const { error: uploadError } = await supabase.storage
      .from("highlight-videos")
      .upload(fileName, selectedVideo);

    if (uploadError) {
      alert(uploadError.message);
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage
      .from("highlight-videos")
      .getPublicUrl(fileName);

    const { error } = await supabase.from("videos").insert({
      player_id: player.user_id,
      title: selectedVideo.name,
      video_url: publicUrl,
    });

    if (error) {
      alert(error.message);
    }

    setSelectedVideo(null);
    setUploading(false);

    setReloadIndex((i) => i + 1);
  } 

  if (loading) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      Loading...
    </main>
  );
}

if (!player) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      Player not found.
    </main>
  );
}

return (
  <main className="min-h-screen bg-gray-100 py-10">
    <div className="max-w-7xl mx-auto space-y-8">

     <PlayerHeader
  player={player}
  addToWatchlist={addToWatchlist}
  savingWatchlist={savingWatchlist}
/>

      <PlayerStats player={player} />

      <SeasonStats player={player} />

      <CareerHistory player={player} />

      <ScoutOverview player={player} />

      <HighlightVideos videos={videos} />

      <VideoUpload
        setSelectedVideo={setSelectedVideo}
        uploadVideo={uploadVideo}
        uploading={uploading}
      />

      <PlayerIDCard player={player} />

    </div>
  </main>
);
}