// Player columns that are safe for anyone to read. Every app query on
// public.player selects from this list - never "*" (including embedded
// selects such as player:player_id(...)).
//
// email and date_of_birth are deliberately absent: they are private. Once
// the planned column-privilege migration is applied, the database refuses
// them to anon/authenticated users entirely (a "*" select would then fail
// with "permission denied"), and only the owner or an admin can read them
// through the get_player_private(p_player_id) function.
//
// Keep this list identical to that migration's GRANT SELECT (...) list.
// Written as one string literal (not built with join) so supabase-js can
// type the selected columns.
export const PLAYER_PUBLIC_COLUMNS =
  "id, created_at, full_name, age, nationality, position, current_club, slug, photo_url, scoutafrica_id, user_id, height, weight, preferred_foot, contract_expiry, bio, verified, cover_photo_url, matches, goals, assists, minutes_played, clean_sheets, yellow_cards, red_card, playing_style, strengths, secondary_position, languages_spoken, availability_status";

export const PLAYER_PUBLIC_COLUMN_LIST = PLAYER_PUBLIC_COLUMNS.split(", ");

export const PLAYER_PRIVATE_COLUMNS = ["email", "date_of_birth"] as const;
