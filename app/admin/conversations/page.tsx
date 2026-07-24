"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

interface AdminConversationRow {
  id: number;
  request_id: number | null;
  scout_id: string | null;
  player_id: number | null;
  active: boolean;
  last_message_at: string | null;
  created_at: string | null;
  player_name: string | null;
  message_count: number;
}

export default function ConversationMonitor() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [rows, setRows] = useState<AdminConversationRow[]>([]);
  const [loading, setLoading] = useState(true);

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

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  useEffect(() => {
    if (checkingAccess) return;

    async function loadConversations() {
      const { data: conversations, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error || !Array.isArray(conversations)) {
        console.error(error);
        setLoading(false);
        return;
      }

      const playerIds = [
        ...new Set(
          conversations
            .map((c) => (typeof c === "object" && c !== null && "player_id" in c ? c.player_id : null))
            .filter((id): id is number => typeof id === "number")
        ),
      ];

      const { data: players } = playerIds.length > 0
        ? await supabase.from("player").select("id, full_name").in("id", playerIds)
        : { data: [] };

      const nameById: Record<number, string> = {};
      if (Array.isArray(players)) {
        for (const p of players) {
          if (typeof p === "object" && p !== null && "id" in p && typeof p.id === "number") {
            nameById[p.id] = "full_name" in p && typeof p.full_name === "string" ? p.full_name : "Unnamed Player";
          }
        }
      }

      const conversationIds = conversations
        .map((c) => (typeof c === "object" && c !== null && "id" in c ? c.id : null))
        .filter((id): id is number => typeof id === "number");

      const { data: messageRows } = conversationIds.length > 0
        ? await supabase.from("messages").select("conversation_id").in("conversation_id", conversationIds)
        : { data: [] };

      const countByConversation: Record<number, number> = {};
      if (Array.isArray(messageRows)) {
        for (const m of messageRows) {
          if (typeof m === "object" && m !== null && "conversation_id" in m && typeof m.conversation_id === "number") {
            countByConversation[m.conversation_id] = (countByConversation[m.conversation_id] || 0) + 1;
          }
        }
      }

      const result: AdminConversationRow[] = conversations
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && "id" in c)
        .map((c) => {
          const id = c.id as number;
          const playerId = (c.player_id as number | null) ?? null;
          return {
            id,
            request_id: (c.request_id as number | null) ?? null,
            scout_id: (c.scout_id as string | null) ?? null,
            player_id: playerId,
            active: Boolean(c.active),
            last_message_at: (c.last_message_at as string | null) ?? null,
            created_at: (c.created_at as string | null) ?? null,
            player_name: playerId !== null ? nameById[playerId] || "Unknown Player" : "Unknown Player",
            message_count: countByConversation[id] || 0,
          };
        });

      setRows(result);
      setLoading(false);
    }

    loadConversations();
  }, [checkingAccess]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin" className="text-green-700 text-sm font-medium">
          ← Back to Admin Dashboard
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mt-2 mb-2">
          Conversation Monitor
        </h1>
        <p className="text-gray-500 mb-8">
          Oversight only - ScoutAfrica admins can view conversation activity but this
          page does not send messages on anyone&apos;s behalf.
        </p>

        {loading && <p className="text-gray-500">Loading conversations...</p>}

        {!loading && rows.length === 0 && (
          <p className="text-gray-500">No conversations yet.</p>
        )}

        {!loading && rows.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="p-4">Player</th>
                  <th className="p-4">Messages</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="p-4 font-medium text-gray-900">{row.player_name}</td>
                    <td className="p-4">{row.message_count}</td>
                    <td className="p-4">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          row.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500">
                      {row.last_message_at ? new Date(row.last_message_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
