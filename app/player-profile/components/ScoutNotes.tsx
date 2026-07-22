"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ScoutNote } from "../../lib/types";

type Props = {
  playerId: number;
  notes: ScoutNote[];
  currentUserId: string;
  onNoteAdded: () => void;
};

// Private notes: RLS scopes these to the authoring scout only (scout_id =
// auth.uid()), so this component only ever receives the current viewer's
// own notes about this player - never another scout's, and never
// anything the player themselves could see. This component itself is
// only rendered for signed-in scouts (checked by the parent page).
export default function ScoutNotes({ playerId, notes, currentUserId, onNoteAdded }: Props) {
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function addNote() {
    if (!newNote.trim()) return;

    setSaving(true);

    const { error } = await supabase.from("scout_notes").insert({
      player_id: playerId,
      scout_id: currentUserId,
      note: newNote.trim(),
    });

    setSaving(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setNewNote("");
    onNoteAdded();
  }

  return (
    <div className="mt-10 bg-white rounded-2xl shadow-lg p-8 border-2 border-dashed border-amber-200">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-2xl font-bold">🔒 Your Scout Notes</h2>
        <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full font-semibold">
          Private
        </span>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Only visible to you. The player and other scouts cannot see these notes.
      </p>

      <div className="space-y-3 mb-6">
        {notes.length === 0 ? (
          <p className="text-gray-400 text-sm">You haven&apos;t added any notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-amber-50 rounded-xl p-4 text-gray-800">
              {note.note}
            </div>
          ))
        )}
      </div>

      <textarea
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
        rows={3}
        placeholder="Add a private scouting note..."
        className="w-full border rounded-lg p-3"
      />

      <button
        onClick={addNote}
        disabled={saving || !newNote.trim()}
        className="mt-3 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50"
      >
        {saving ? "Saving..." : "Add Note"}
      </button>
    </div>
  );
}
