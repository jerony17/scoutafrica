"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import type { Player } from "../../lib/types";
import { FiArrowLeft, FiSearch, FiX, FiCheckCircle, FiAlertCircle } from "react-icons/fi";

// Admin control panel for the homepage's Hero Spotlight card and the 4
// Featured Player Profile cards - both previously hardcoded demo data
// (app/lib/featuredPlayers.ts), now backed by public.featured_player_slots
// (045_featured_player_slots.sql), a fixed 5-row table this page only ever
// UPDATEs (never inserts/deletes rows - the 5 slots are permanent).
//
// Each slot independently falls back to its own demo player on the
// homepage whenever it's inactive or empty here - see
// app/lib/featuredPlayers.ts for that logic. This page only needs to
// read/write player_id and active per slot; it never needs to know about
// or reproduce that fallback data itself.

const SLOT_KEYS = ["hero_spotlight", "featured_1", "featured_2", "featured_3", "featured_4"] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

const SLOT_LABELS: Record<SlotKey, string> = {
  hero_spotlight: "Hero Spotlight",
  featured_1: "Featured Player 1",
  featured_2: "Featured Player 2",
  featured_3: "Featured Player 3",
  featured_4: "Featured Player 4",
};

const SLOT_DESCRIPTIONS: Record<SlotKey, string> = {
  hero_spotlight: "The player card at the top-right of the homepage hero section.",
  featured_1: "1st card in the homepage's \"Featured Player Profiles\" row.",
  featured_2: "2nd card in the homepage's \"Featured Player Profiles\" row.",
  featured_3: "3rd card in the homepage's \"Featured Player Profiles\" row.",
  featured_4: "4th card in the homepage's \"Featured Player Profiles\" row.",
};

type Slot = {
  id: number;
  slot_key: SlotKey;
  active: boolean;
  player_id: number | null;
  player: Player | null;
};

type SlotRow = {
  id: number;
  slot_key: SlotKey;
  active: boolean;
  player_id: number | null;
  player: Player | null;
};

export default function AdminFeaturedPlayersPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [savingSlot, setSavingSlot] = useState<SlotKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Which slot's inline "choose a player" search is currently open.
  const [pickerSlot, setPickerSlot] = useState<SlotKey | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }
      if (user.app_metadata?.is_admin !== true) {
        router.replace("/");
        return;
      }
      setUserId(user.id);
      setCheckingAccess(false);
    }
    checkAccess();
  }, [router]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    const { data, error } = await supabase
      .from("featured_player_slots")
      .select("id, slot_key, active, player_id, player:player_id(*)")
      .returns<SlotRow[]>();

    if (error) {
      console.error("Failed to load featured player slots:", error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    const bySlotKey = new Map((data ?? []).map((row) => [row.slot_key, row]));
    setSlots(
      SLOT_KEYS.map((key) => {
        const row = bySlotKey.get(key);
        return {
          id: row?.id ?? 0,
          slot_key: key,
          active: row?.active ?? true,
          player_id: row?.player_id ?? null,
          player: row?.player ?? null,
        };
      })
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (checkingAccess) return;
    // Deferred so loadSlots' synchronous state resets don't run inside the
    // effect body - same fix already applied to app/admin/players/page.tsx
    // for this exact issue.
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadSlots();
    });
    return () => {
      cancelled = true;
    };
  }, [checkingAccess, loadSlots]);

  // Player search for the inline picker - same idiom as
  // app/admin/players/page.tsx's search (ilike on name/scoutafrica_id).
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!pickerSlot) return;

    let cancelled = false;
    async function runSearch() {
      setSearchLoading(true);
      let query = supabase.from("player").select("*").order("full_name", { ascending: true }).limit(20);
      if (debouncedSearch) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,scoutafrica_id.ilike.%${debouncedSearch}%`);
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error("Player search failed:", error);
        setSearchResults([]);
      } else {
        setSearchResults((data ?? []) as Player[]);
      }
      setSearchLoading(false);
    }
    runSearch();
    return () => {
      cancelled = true;
    };
  }, [pickerSlot, debouncedSearch]);

  function openPicker(slotKey: SlotKey) {
    setPickerSlot(slotKey);
    setSearch("");
    setSearchResults([]);
  }

  function closePicker() {
    setPickerSlot(null);
    setSearch("");
    setSearchResults([]);
  }

  async function saveSlot(slotKey: SlotKey, patch: { player_id?: number | null; active?: boolean }) {
    setSavingSlot(slotKey);
    setSaveError(null);

    const slot = slots.find((s) => s.slot_key === slotKey);
    const { error } = await supabase
      .from("featured_player_slots")
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("slot_key", slotKey);

    if (error) {
      console.error(`Failed to update slot ${slotKey}:`, error);
      setSaveError(`Couldn't save "${SLOT_LABELS[slotKey]}" - please try again.`);
      setSavingSlot(null);
      return;
    }

    // Reflect the change locally instead of a full refetch - the picked
    // player object is already in hand (from the search results) for a
    // selection, and null is enough for a clear/deactivate.
    setSlots((prev) =>
      prev.map((s) => (s.slot_key === slotKey ? { ...s, ...patch } : s))
    );
    if (slot?.id === 0) {
      // Defensive: a slot row was somehow missing on load (shouldn't
      // happen - the migration seeds all 5) - refetch to get its real id.
      loadSlots();
    }
    setSavingSlot(null);
  }

  async function selectPlayer(slotKey: SlotKey, player: Player) {
    await saveSlot(slotKey, { player_id: player.id });
    setSlots((prev) => prev.map((s) => (s.slot_key === slotKey ? { ...s, player } : s)));
    closePicker();
  }

  async function clearSlot(slotKey: SlotKey) {
    await saveSlot(slotKey, { player_id: null });
    setSlots((prev) => prev.map((s) => (s.slot_key === slotKey ? { ...s, player: null } : s)));
  }

  async function toggleActive(slotKey: SlotKey, active: boolean) {
    await saveSlot(slotKey, { active });
  }

  if (checkingAccess) {
    return <main className="min-h-screen flex items-center justify-center">Checking access...</main>;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-8">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-green-700 text-sm font-medium mb-4">
          <FiArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Featured Players</h1>
        <p className="text-gray-500 mt-1 mb-6">
          Choose which players appear in the homepage&apos;s Hero Spotlight card and the 4 Featured Player Profile
          cards. A slot that&apos;s empty or turned off shows its own placeholder player on the homepage instead -
          it never breaks the layout.
        </p>

        {saveError && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            {saveError}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">Loading slots...</p>
        ) : loadError ? (
          <p className="text-red-600">Couldn&apos;t load featured player slots. Please refresh the page.</p>
        ) : (
          <div className="space-y-4">
            {slots.map((slot) => (
              <div key={slot.slot_key} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="font-semibold text-gray-900">{SLOT_LABELS[slot.slot_key]}</h2>
                    <p className="text-sm text-gray-500">{SLOT_DESCRIPTIONS[slot.slot_key]}</p>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 shrink-0">
                    <input
                      type="checkbox"
                      checked={slot.active}
                      disabled={savingSlot === slot.slot_key}
                      onChange={(e) => toggleActive(slot.slot_key, e.target.checked)}
                      className="w-4 h-4 accent-green-600"
                    />
                    {slot.active ? "Active" : "Inactive"}
                  </label>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  {slot.player ? (
                    <>
                      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0">
                        {slot.player.photo_url && (
                          <Image src={slot.player.photo_url} alt="" fill className="object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate flex items-center gap-1.5">
                          {slot.player.full_name ?? "Unnamed Player"}
                          {slot.player.verified && <FiCheckCircle className="w-3.5 h-3.5 text-green-600" />}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {slot.player.position ?? "—"} · {slot.player.nationality ?? "—"}
                        </p>
                      </div>
                      <div className="ml-auto flex gap-2 shrink-0">
                        <button
                          onClick={() => openPicker(slot.slot_key)}
                          disabled={savingSlot === slot.slot_key}
                          className="text-sm font-medium text-green-700 hover:underline"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => clearSlot(slot.slot_key)}
                          disabled={savingSlot === slot.slot_key}
                          className="text-sm font-medium text-gray-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400 italic">
                        Empty - homepage is showing this slot&apos;s placeholder player.
                      </p>
                      <button
                        onClick={() => openPicker(slot.slot_key)}
                        disabled={savingSlot === slot.slot_key}
                        className="ml-auto shrink-0 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
                      >
                        Select Player
                      </button>
                    </>
                  )}
                </div>

                {pickerSlot === slot.slot_key && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="relative flex-1">
                        <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          autoFocus
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search players by name..."
                          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        onClick={closePicker}
                        className="text-gray-400 hover:text-gray-600 p-2"
                        aria-label="Close"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>

                    {searchLoading ? (
                      <p className="text-sm text-gray-400">Searching...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        No players found{debouncedSearch ? ` for "${debouncedSearch}"` : ""}.
                      </p>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {searchResults.map((p) => (
                          <li key={p.id}>
                            <button
                              onClick={() => selectPlayer(slot.slot_key, p)}
                              className="w-full flex items-center gap-3 py-2 px-1 hover:bg-gray-50 rounded-lg text-left"
                            >
                              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0">
                                {p.photo_url && <Image src={p.photo_url} alt="" fill className="object-cover" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {p.full_name ?? "Unnamed Player"}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {p.position ?? "—"} · {p.nationality ?? "—"}
                                </p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
