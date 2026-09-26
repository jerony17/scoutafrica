"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  isAchievement,
  isArrayOf,
  isPlayer,
  isPlayerPhoto,
  isScoutNote,
  isVideoRecord,
} from "../../lib/types";
import type { Achievement, Player, PlayerPhoto, ScoutNote, VideoRecord } from "../../lib/types";

import PlayerHeader from "../components/PlayerHeader";
import ActionButtons from "../components/ActionButtons";
import PlayerStats from "../components/PlayerStats";
import SeasonStats from "../components/SeasonStats";
import CareerHistory from "../components/CareerHistory";
import ScoutOverview from "../components/ScoutOverview";
import Achievements from "../components/Achievements";
import HighlightVideos from "../components/HighlightVideos";
import VideoUpload from "../components/VideoUpload";
import PhotoGallery from "../components/PhotoGallery";
import PhotoUpload from "../components/PhotoUpload";
import ScoutNotes from "../components/ScoutNotes";
import SimilarPlayers from "../components/SimilarPlayers";
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

  const [photos, setPhotos] = useState<PlayerPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [similarPlayers, setSimilarPlayers] = useState<Player[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isScoutViewer, setIsScoutViewer] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [scoutNotes, setScoutNotes] = useState<ScoutNote[]>([]);

  const [savingWatchlist, setSavingWatchlist] = useState(false);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    async function loadPlayer() {
      // Explicit column list (never "*") - this is a public, unauthenticated
      // page, so the Supabase query runs in the browser and its raw JSON
      // response is visible in devtools/network tab. Deliberately excludes
      // email, date_of_birth, and created_at: none are rendered anywhere on
      // this page (confirmed by auditing every component it uses), and
      // email in particular must never reach the browser here.
      const { data, error } = await supabase
        .from("player")
        .select(
          "id, user_id, full_name, slug, photo_url, cover_photo_url, verified, availability_status, scoutafrica_id, nationality, position, current_club, age, height, weight, preferred_foot, bio, playing_style, strengths, secondary_position, languages_spoken, contract_expiry, matches, goals, assists, minutes_played, clean_sheets, yellow_cards, red_card"
        )
        .eq("slug", slug)
        .single();

      if (error || !data || !isPlayer(data)) {
        console.error(error);
        setLoading(false);
        return;
      }

      setPlayer(data);

      // Log this view for the "Total Players Viewed" dashboard stat (scout/club/
      // agent dashboards) - best-effort, never blocks rendering, and skipped when
      // players view their own profile (not a meaningful scouting metric).
      const {
        data: { user: viewer },
      } = await supabase.auth.getUser();
      if (viewer && viewer.id !== data.user_id) {
        supabase.from("player_views").insert({ viewer_id: viewer.id, player_id: data.id }).then();
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUserId(user?.id ?? null);
      setIsOwnProfile(Boolean(user && data.user_id === user.id));
      setIsScoutViewer(user?.user_metadata?.account_type === "scout");

      const [videosResult, photosResult, achievementsResult] = await Promise.all([
        supabase
          .from("videos")
          .select("*")
          .eq("player_id", data.user_id || "")
          .order("created_at", { ascending: false }),
        supabase
          .from("player_photos")
          .select("*")
          .eq("player_id", data.user_id || "")
          .order("created_at", { ascending: false }),
        supabase
          .from("achievements")
          .select("*")
          .eq("player_id", data.id)
          .order("year", { ascending: false }),
      ]);

      setVideos(isArrayOf(videosResult.data, isVideoRecord) ? videosResult.data : []);
      setPhotos(isArrayOf(photosResult.data, isPlayerPhoto) ? photosResult.data : []);
      setAchievements(
        isArrayOf(achievementsResult.data, isAchievement) ? achievementsResult.data : []
      );

      // Similar players: same position, nationality, or an age within 2
      // years, excluding this player, capped at 3.
      if (data.position || data.nationality || data.age != null) {
        const orClauses: string[] = [];
        if (data.position) orClauses.push(`position.eq.${data.position}`);
        if (data.nationality) orClauses.push(`nationality.eq.${data.nationality}`);
        if (data.age != null) {
          orClauses.push(`and(age.gte.${data.age - 2},age.lte.${data.age + 2})`);
        }

        // Explicit column list - only what SimilarPlayers.tsx renders.
        const { data: similar } = await supabase
          .from("player")
          .select("id, slug, photo_url, full_name, position, nationality")
          .neq("id", data.id)
          .or(orClauses.join(","))
          .limit(3);

        setSimilarPlayers(isArrayOf(similar, isPlayer) ? similar : []);
      }

      if (user?.user_metadata?.account_type === "scout") {
        const { data: notes } = await supabase
          .from("scout_notes")
          .select("*")
          .eq("player_id", data.id)
          .eq("scout_id", user.id)
          .order("created_at", { ascending: false });

        setScoutNotes(isArrayOf(notes, isScoutNote) ? notes : []);
      }

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

    // Owner-scoped path (<auth.uid()>/...) requires the actual
    // authenticated caller's own id, not player.user_id (the id of the
    // profile being *viewed*, which only equals the caller's own id when
    // the UI's isOwnProfile gate holds) - the storage policy checks this
    // same id, so it must come from the caller's own verified session.
    // See supabase/migrations/046_secure_legacy_storage_buckets.sql.
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller) {
      alert("Please sign in to upload a video.");
      return;
    }

    setUploading(true);

    const fileName = `${caller.id}/${Date.now()}-${selectedVideo.name}`;

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
    } = supabase.storage.from("highlight-videos").getPublicUrl(fileName);

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

  async function uploadPhoto() {
    if (!selectedPhoto || !player || !player.user_id) return;

    // Owner-scoped path (<auth.uid()>/...) requires the actual
    // authenticated caller's own id, not player.user_id - see the
    // matching comment in uploadVideo() above.
    const {
      data: { user: caller },
    } = await supabase.auth.getUser();

    if (!caller) {
      alert("Please sign in to upload a photo.");
      return;
    }

    setUploadingPhoto(true);

    const fileName = `${caller.id}/${Date.now()}-${selectedPhoto.name}`;

    const { error: uploadError } = await supabase.storage
      .from("player-photos")
      .upload(fileName, selectedPhoto);

    if (uploadError) {
      alert(uploadError.message);
      setUploadingPhoto(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("player-photos").getPublicUrl(fileName);

    const { error } = await supabase.from("player_photos").insert({
      player_id: player.user_id,
      photo_url: publicUrl,
    });

    if (error) {
      alert(error.message);
    }

    setSelectedPhoto(null);
    setUploadingPhoto(false);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <PlayerHeader player={player} />

        <ActionButtons
          player={player}
          addToWatchlist={addToWatchlist}
          savingWatchlist={savingWatchlist}
        />

        <PlayerStats player={player} />

        <SeasonStats player={player} />

        <ScoutOverview player={player} />

        <CareerHistory player={player} />

        <Achievements achievements={achievements} />

        <HighlightVideos videos={videos} />

        {isOwnProfile && (
               <VideoUpload
  setSelectedVideo={setSelectedVideo}
  uploadVideo={uploadVideo}
  uploading={uploading}
  videoCount={videos.length}
  isPremium={false}
/> 
        )}

        <PhotoGallery photos={photos} />

        {isOwnProfile && (
          <PhotoUpload
            setSelectedPhoto={setSelectedPhoto}
            uploadPhoto={uploadPhoto}
            uploading={uploadingPhoto}
          />
        )}

        {isScoutViewer && currentUserId && (
          <ScoutNotes
            playerId={player.id}
            notes={scoutNotes}
            currentUserId={currentUserId}
            onNoteAdded={() => setReloadIndex((i) => i + 1)}
          />
        )}

        <SimilarPlayers players={similarPlayers} />

        <PlayerIDCard player={player} />
      </div>
    </main>
  );
}
