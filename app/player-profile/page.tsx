"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase"; 

import SeasonStats from "./components/SeasonStats";
import ScoutOverview from "./components/ScoutOverview";
import PlayerHeader from "./components/PlayerHeader";
import PlayerStats from "./components/PlayerStats";
import CareerHistory from "./components/CareerHistory";
import HighlightVideos from "./components/HighlightVideos";
import VideoUpload from "./components/VideoUpload";
import PlayerIDCard from "./components/PlayerIDCard";

export default function PlayerProfile() {
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<any>(null); 
  const [videos, setVideos] = useState<any[]>([]);
const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
const [uploading, setUploading] = useState(false); 
const [savingWatchlist, setSavingWatchlist] = useState(false);

  useEffect(() => {
  loadPlayer();
  }, []);      

  async function addToWatchlist(playerId: number) {
  setSavingWatchlist(true);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

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

  if (!selectedVideo || !player) return;

  setUploading(true);

  const fileName = `${Date.now()}-${selectedVideo.name}`;

  const { error: uploadError } = await supabase.storage
    .from("highlight-videos")
    .upload(fileName, selectedVideo); 
    console.log("Storage upload error:", uploadError);
alert("Storage upload finished"); 


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

    const {
  data: { user },
} = await supabase.auth.getUser(); 
if (!user) {
  alert("No authenticated user!");
  return;
}

alert(`Logged in as: ${user.email}\nUser ID: ${user.id}`);

alert(
  `User ID: ${user?.id}
Player.user_id: ${player?.user_id}
Player.id: ${player?.id}`
);  

alert("About to insert into videos table");
  const { data, error } = await supabase
  .from("videos")
  .insert({
    player_id: player!.user_id,
    title: selectedVideo.name,
    video_url: publicUrl,
  }); 
  

console.log("Insert data:", data);
console.log("Insert error:", error);

if (error) {
  alert(error.message);
  return;
}

  setSelectedVideo(null);
  setUploading(false);

  await loadPlayer();
}
  
  async function loadPlayer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("player")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    setPlayer(data);
    const { data: playerVideos } = await supabase
  .from("videos")
  .select("*")
  .eq("player_id", data.user_id)
  .order("created_at", { ascending: false });

setVideos(playerVideos || []);

    setLoading(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading Player...
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
  selectedVideo={selectedVideo}
  setSelectedVideo={setSelectedVideo}
  uploadVideo={uploadVideo}
  uploading={uploading}
/>

      <PlayerIDCard player={player} />

    </div>
  </main>
);

}

