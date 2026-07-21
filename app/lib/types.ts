// Shared types matching the live Supabase schema exactly (public schema,
// verified via information_schema.columns). Used across the app instead of
// `any` for every Supabase query result.

export interface Player {
  id: number;
  created_at: string;
  full_name: string | null;
  age: number | null;
  nationality: string | null;
  position: string | null;
  current_club: string | null;
  slug: string | null;
  photo_url: string | null;
  email: string | null;
  scoutafrica_id: string | null;
  user_id: string | null;
  height: number | null;
  weight: number | null;
  preferred_foot: string | null;
  date_of_birth: string | null;
  contract_expiry: string | null;
  bio: string | null;
  verified: boolean | null;
  cover_photo_url: string | null;
  matches: number | null;
  goals: number | null;
  assists: number | null;
  minutes_played: number | null;
  clean_sheets: number | null;
  yellow_cards: number | null;
  red_card: number | null;
}

export interface CareerHistoryEntry {
  id: number;
  created_at: string;
  year: string | null;
  club_name: string | null;
  league: string | null;
  country: string | null;
  position: string | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  display_order: number | null;
  player_id: number | null;
}

export interface ContactRequest {
  id: number;
  created_at: string;
  sender_id: string | null;
  player_id: number | null;
  sender_type: string | null;
  request_type: string | null;
  message: string | null;
  status: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface Conversation {
  id: number;
  request_id: number | null;
  created_at: string | null;
  scout_id: string | null;
  player_id: number | null;
}

export interface ConversationWithPlayer extends Conversation {
  player: Pick<Player, "id" | "full_name" | "photo_url" | "user_id"> | null;
}

export interface Favorite {
  id: number;
  scout_id: string | null;
  player_id: number | null;
  created_at: string | null;
}

export interface Message {
  id: number;
  sender_id: string | null;
  receiver_id: string | null;
  message: string;
  created_at: string | null;
  conversation_id: number | null;
}

export interface VideoRecord {
  id: number;
  player_id: string;
  title: string;
  video_url: string;
  created_at: string | null;
}

export interface WatchlistEntry {
  id: number;
  scout_id: string;
  player_id: number;
  created_at: string | null;
}

// Supabase errors from supabase-js are PostgrestError | null in practice.
export interface SupabaseErrorLike {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}
