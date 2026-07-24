"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isArrayOf, isMessage } from "../lib/types";
import type { ConversationWithPlayer, Message, Player } from "../lib/types";

interface RawConversation {
  id: number;
  request_id: number | null;
  created_at: string | null;
  scout_id: string | null;
  player_id: number | null;
  last_message_at: string | null;
  active: boolean;
}

function isRawConversation(value: unknown): value is RawConversation {
  return typeof value === "object" && value !== null && "id" in value && "scout_id" in value;
}

export default function Messages() {
  const [conversations, setConversations] = useState<ConversationWithPlayer[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithPlayer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [lastMessageByConversation, setLastMessageByConversation] = useState<
    Record<number, { text: string; created_at: string | null }>
  >({});
  const [unreadByConversation, setUnreadByConversation] = useState<Record<number, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadConversations(userId: string) {
      setLoadingConversations(true);

      // RLS already scopes this to conversations the current user is actually part of
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error || !isArrayOf(data, isRawConversation)) {
        setLoadingConversations(false);
        return;
      }

      const playerIds = [...new Set(data.map((c) => c.player_id).filter((id): id is number => id !== null))];
      let playersById: Record<number, Pick<Player, "id" | "full_name" | "photo_url" | "user_id">> = {};

      if (playerIds.length > 0) {
        const { data: players } = await supabase
          .from("player")
          .select("id, full_name, photo_url, user_id")
          .in("id", playerIds);

        if (Array.isArray(players)) {
          playersById = Object.fromEntries(
            players
              .filter((p): p is { id: number; full_name: string | null; photo_url: string | null; user_id: string | null } =>
                typeof p === "object" && p !== null && typeof p.id === "number"
              )
              .map((p) => [p.id, { id: p.id, full_name: p.full_name, photo_url: p.photo_url, user_id: p.user_id }])
          );
        }
      }

      const enriched: ConversationWithPlayer[] = data.map((c) => ({
        ...c,
        player: (c.player_id !== null ? playersById[c.player_id] : null) || null,
      }));

      setConversations(enriched);

      // Batch-load last message + unread count per conversation, avoiding N+1 queries
      const conversationIds = data.map((c) => c.id);
      if (conversationIds.length > 0) {
        const { data: allMessages } = await supabase
          .from("messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true });

        if (isArrayOf(allMessages, isMessage)) {
          const lastMsg: Record<number, { text: string; created_at: string | null }> = {};
          const unread: Record<number, number> = {};

          for (const m of allMessages) {
            if (m.conversation_id === null) continue;
          lastMsg[m.conversation_id] = { text: m.message, created_at: m.created_at };
          if (m.receiver_id === userId && !m.read) {
            unread[m.conversation_id] = (unread[m.conversation_id] || 0) + 1;
          }
        }

        setLastMessageByConversation(lastMsg);
        setUnreadByConversation(unread);
      }
    }

    setLoadingConversations(false);
  }

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setCurrentUserId(user.id);
      await loadConversations(user.id);
    }

    init();
  }, []);

  async function loadMessages(conversationId: number) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && isArrayOf(data, isMessage)) {
      setMessages(data);

      // Mark incoming unread messages as read
      const unreadIncoming = data.filter((m) => m.receiver_id === currentUserId && !m.read);
      if (unreadIncoming.length > 0) {
        await supabase
          .from("messages")
          .update({ read: true })
          .in("id", unreadIncoming.map((m) => m.id));

        setUnreadByConversation((prev) => ({ ...prev, [conversationId]: 0 }));
      }
    }
  }

  // Realtime: new messages in the selected conversation, no polling
  useEffect(() => {
    if (!selectedConversation) return;

    const channel = supabase
      .channel(`conversation-${selectedConversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConversation.id}`,
        },
        (payload) => {
          const row = payload.new;
          if (isMessage(row)) {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            if (row.receiver_id === currentUserId) {
              supabase.from("messages").update({ read: true }).eq("id", row.id).then();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversation, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function counterpartLabel(conversation: ConversationWithPlayer | null) {
    if (!conversation) return "";
    const iAmScout = currentUserId === conversation.scout_id;
    if (iAmScout) {
      return conversation.player?.full_name || "Player";
    }
    return "Scout / Club / Agent";
  }

  async function sendMessage() {
    const text = newMessage.trim();
    if (!text || !selectedConversation || !currentUserId) return;

    const iAmScout = currentUserId === selectedConversation.scout_id;
    const receiverId = iAmScout
      ? selectedConversation.player?.user_id
      : selectedConversation.scout_id;

    if (!receiverId) {
      alert("Can't determine the recipient for this conversation.");
      return;
    }

    setSending(true);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: receiverId,
        conversation_id: selectedConversation.id,
        message: text,
      })
      .select("id, created_at")
      .single();

    setSending(false);

    if (error || !data || typeof data.id !== "number") {
      alert(error?.message || "Failed to send message.");
      return;
    }

    const sentMessage: Message = {
      id: data.id,
      sender_id: currentUserId,
      receiver_id: receiverId,
      message: text,
      created_at: typeof data.created_at === "string" ? data.created_at : null,
      conversation_id: selectedConversation.id,
      read: false,
    };

    setMessages((prev) => (prev.some((m) => m.id === sentMessage.id) ? prev : [...prev, sentMessage]));
    setNewMessage("");
    setLastMessageByConversation((prev) => ({
      ...prev,
      [selectedConversation.id]: { text, created_at: sentMessage.created_at },
    }));
  }

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const iAmScout = currentUserId === c.scout_id;
      const label = iAmScout ? c.player?.full_name || "Player" : "Scout / Club / Agent";
      return label.toLowerCase().includes(q);
    });
  }, [conversations, search, currentUserId]);

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold text-green-700 mb-6 sm:mb-8">
          Messages
        </h1>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-md p-4 md:h-[70vh] md:overflow-y-auto">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full border rounded-lg p-2.5 mb-4 text-sm"
            />

            {loadingConversations && (
              <p className="text-gray-500 text-sm">Loading conversations...</p>
            )}

            {!loadingConversations && filteredConversations.length === 0 && (
              <p className="text-gray-500 text-sm">
                {conversations.length === 0
                  ? "No conversations yet. Conversations start once a contact request has been approved."
                  : "No conversations match your search."}
              </p>
            )}

            <div className="space-y-2">
              {filteredConversations.map((conversation) => {
                const last = lastMessageByConversation[conversation.id];
                const unread = unreadByConversation[conversation.id] || 0;

                return (
                  <div
                    key={conversation.id}
                    onClick={() => {
                      setSelectedConversation(conversation);
                      loadMessages(conversation.id);
                    }}
                    className={`border p-3 rounded-xl cursor-pointer hover:bg-gray-50 transition ${
                      selectedConversation?.id === conversation.id
                        ? "border-green-600 bg-green-50"
                        : "border-gray-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 truncate">
                        {counterpartLabel(conversation)}
                      </p>
                      {unread > 0 && (
                        <span className="bg-green-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </div>
                    {last && (
                      <p className="text-sm text-gray-500 truncate mt-0.5">{last.text}</p>
                    )}
                    {(last?.created_at || conversation.last_message_at) && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(last?.created_at || conversation.last_message_at || "").toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-md p-4 sm:p-6 flex flex-col md:h-[70vh]">
            {!selectedConversation && (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-center px-4">
                Select a conversation to view messages.
              </div>
            )}

            {selectedConversation && (
              <>
                <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                  <h2 className="text-xl font-bold">
                    {counterpartLabel(selectedConversation)}
                  </h2>
                  <p className="text-xs text-gray-400 italic">Typing indicator coming soon</p>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {messages.length === 0 && (
                    <p className="text-gray-500 text-sm">
                      No messages yet. Say hello!
                    </p>
                  )}

                  {messages.map((message) => {
                    const isMine = message.sender_id === currentUserId;
                    return (
                      <div key={message.id} className={isMine ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={
                            isMine
                              ? "bg-green-600 text-white p-3 rounded-2xl rounded-br-sm max-w-[80%]"
                              : "bg-gray-100 p-3 rounded-2xl rounded-bl-sm max-w-[80%]"
                          }
                        >
                          <p>{message.message}</p>
                          <p className={`text-[10px] mt-1 ${isMine ? "text-green-100" : "text-gray-400"}`}>
                            {message.created_at ? new Date(message.created_at).toLocaleTimeString() : ""}
                            {isMine && (message.read ? " · Read" : " · Sent")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="flex gap-3 mt-6">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                    placeholder="Type a message..."
                    className="flex-1 border rounded-lg p-3"
                  />

                  <button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="bg-green-600 text-white px-6 rounded-lg disabled:opacity-50"
                  >
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
