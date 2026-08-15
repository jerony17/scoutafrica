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
  playing_style: string | null;
  strengths: string[] | null;
  secondary_position: string | null;
  languages_spoken: string[] | null;
  availability_status: "Available" | "In Contract" | "On Trial" | null;
}

export interface Achievement {
  id: number;
  player_id: number | null;
  category: "national_team" | "championship" | "individual_award" | "tournament_award";
  title: string;
  year: string | null;
  created_at: string | null;
}

export interface ScoutNote {
  id: number;
  player_id: number | null;
  scout_id: string | null;
  note: string;
  created_at: string | null;
}

export interface PlayerPhoto {
  id: number;
  player_id: string | null;
  photo_url: string;
  caption: string | null;
  created_at: string | null;
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
  last_message_at: string | null;
  active: boolean;
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
  read: boolean;
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

// Runtime type predicates - a universal alternative to relying on
// .returns<T>() correctly narrowing Supabase query results, which has shown
// unreliable inference in this project for larger/full-row shapes. These
// perform a minimal, real structural check at runtime and let TypeScript's
// "value is T" predicate mechanism provide full, sound type narrowing -
// no `any`, no `as`/`as unknown as` casts, no suppressions, and no
// dependency on field count or on the Supabase client's own type inference.

export function isPlayer(value: unknown): value is Player {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "full_name" in value &&
    "slug" in value
  );
}

export function isCareerHistoryEntry(value: unknown): value is CareerHistoryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "player_id" in value
  );
}

export function isContactRequest(value: unknown): value is ContactRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "sender_id" in value
  );
}

export function isConversation(value: unknown): value is Conversation {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "scout_id" in value
  );
}

export function isMessage(value: unknown): value is Message {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "message" in value
  );
}

export function isVideoRecord(value: unknown): value is VideoRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "video_url" in value
  );
}

export function isAchievement(value: unknown): value is Achievement {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "category" in value &&
    "title" in value
  );
}

export function isScoutNote(value: unknown): value is ScoutNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "note" in value
  );
}

export function isPlayerPhoto(value: unknown): value is PlayerPhoto {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "photo_url" in value
  );
}

export interface AccountVerification {
  id: number;
  user_id: string | null;
  account_type: "club" | "scout" | "agent" | "academy";
  display_name: string | null;
  email: string | null;
  status: "pending" | "verified" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  organization_name: string | null;
  country: string | null;
  city: string | null;
  representative_name: string | null;
  registration_number: string | null;
  website: string | null;
  rejection_reason: string | null;
  verified_by: string | null;
  verified_at: string | null;
  updated_at: string | null;
}

export interface VerificationDocument {
  id: number;
  application_id: number;
  document_type: "business_registration" | "fa_license" | "government_registration" | "supporting";
  file_name: string;
  storage_path: string;
  uploaded_at: string | null;
}

export function isVerificationDocument(value: unknown): value is VerificationDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "application_id" in value &&
    "storage_path" in value
  );
}

export function isAccountVerification(value: unknown): value is AccountVerification {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "account_type" in value &&
    "status" in value
  );
}

export interface PlayerReport {
  id: number;
  player_id: number | null;
  reporter_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string | null;
}

export function isPlayerReport(value: unknown): value is PlayerReport {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "reason" in value &&
    "status" in value
  );
}      

export type AdPlacement =
  | "Homepage"
  | "Player Profiles"
  | "Find Players"
  | "Club Pages"
  | "Dashboard"
  | "All Website";

export type AdStatus =
  | "Draft"
  | "Pending"
  | "Active"
  | "Paused"
  | "Expired";

export interface Advertisement {
  id: number;
  title: string;
  advertiser_name: string;
  description: string | null;
  image_url: string | null;
  destination_url: string;
  placement: AdPlacement;
  start_date: string;
  end_date: string | null;
  status: AdStatus;
  impressions: number;
  clicks: number;
  created_at: string | null;
  updated_at: string | null;
}

export function isAdvertisement(
  value: unknown
): value is Advertisement {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "destination_url" in value &&
    "status" in value
  );
}

export interface Notification {
  id: number;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  related_id: number | null;
  read: boolean;
  created_at: string | null;
}

export function isNotification(value: unknown): value is Notification {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "message" in value &&
    "read" in value
  );
}

export interface MessageAttachment {
  id: number;
  message_id: number;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string | null;
}

export function isMessageAttachment(value: unknown): value is MessageAttachment {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "message_id" in value &&
    "storage_path" in value
  );
}

export interface ClubProfile {
  id: number;
  user_id: string;
  club_name: string | null;
  logo_url: string | null;
  cover_photo_url: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  founded_year: number | null;
  stadium: string | null;
  website: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ClubPrivateInfo {
  id: number;
  user_id: string;
  email: string | null;
  phone: string | null;
}

export interface ClubPublicStats {
  players_viewed: number;
  watchlist_count: number;
  contact_requests_sent: number;
}

export function isClubProfile(value: unknown): value is ClubProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "user_id" in value &&
    "club_name" in value
  );
}

export function isClubPrivateInfo(value: unknown): value is ClubPrivateInfo {
  return typeof value === "object" && value !== null && "id" in value && "user_id" in value;
}

export interface Subscription {
  id: number;
  user_id: string;
  account_type: string | null;
  plan: "premium_monthly" | "premium_annual" | null;
  billing_cycle: "monthly" | "annual" | null;
  amount: number | null;
  currency: string | null;
  payment_provider: "stripe" | "paystack" | null;
  payment_method: string | null;
  transaction_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  status: "free" | "premium" | "pending" | "cancelled" | "expired" | "renewing" | "past_due";
  started_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PaymentHistoryEntry {
  id: number;
  subscription_id: number;
  payment_provider: "stripe" | "paystack";
  payment_method: string | null;
  amount: number;
  currency: string;
  transaction_reference: string | null;
  payment_status: "success" | "failed" | "pending" | "refunded";
  payment_date: string | null;
}

export function isSubscription(value: unknown): value is Subscription {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "user_id" in value &&
    "status" in value
  );
}

export function isPaymentHistoryEntry(value: unknown): value is PaymentHistoryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "subscription_id" in value &&
    "payment_status" in value
  );
}

export type SupportTicketReason =
  | "General Question"
  | "Premium Subscription"
  | "Payment Issue"
  | "Report a Bug"
  | "Player Verification"
  | "Club Account"
  | "Scout Account"
  | "Partnership / Sponsorship"
  | "Report a User"
  | "Suggest a Feature"
  | "Other";

export type SupportTicketStatus = "Open" | "In Progress" | "Resolved" | "Closed";

export interface SupportTicket {
  id: number;
  user_id: string | null;
  full_name: string | null;
  email: string | null;
  reason: SupportTicketReason;
  subject: string;
  message: string;
  attachment_url: string | null;
  attachment_name: string | null;
  status: SupportTicketStatus;
  priority: "Low" | "Normal" | "High" | "Urgent";
  assigned_to: string | null;
  resolved_at: string | null;
  admin_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function isSupportTicket(value: unknown): value is SupportTicket {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "reason" in value &&
    "subject" in value &&
    "message" in value
  );
}

export function isArrayOf<T>(
  value: unknown,
  check: (v: unknown) => v is T
): value is T[] {
  return Array.isArray(value) && value.every(check);
}

// Add this to app/lib/types.ts

export interface FounderProfile {
  id: number;
  full_name: string;
  position: string;
  company: string;
  country: string | null;
  country_flag: string | null;
  current_base: string | null;
  current_base_flag: string | null;
  photo_url: string | null;
  message: string | null;
  mission_points: string[] | null;
  vision: string | null;
  core_values: string[] | null;
  industry_tags: string[] | null;
  platform_founded: string | null;
  active_since: string | null;
  current_version: string | null;
  countries_served: string | null;
  players_connected: string | null;
  updated_at: string | null;
  updated_by: string | null;
}
export interface CareerHistory {
  id: number;
  player_id: number;

  club_name: string;
  country: string | null;
  league: string | null;
  position: string | null;
  year: string | null;

  appearances: number | null;
  goals: number | null;
  assists: number | null; 
  display_order: number | null;
  created_at: string;
}

export function isFounderProfile(value: unknown): value is FounderProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "full_name" in value &&
    "position" in value
  );
}
