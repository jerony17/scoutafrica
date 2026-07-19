"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Messages() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setCurrentUserId(user.id);
    await loadConversations(user.id);
  }

  async function loadConversations(userId: string) {
    setLoadingConversations(true);

    // RLS already scopes this to conversations the current user is actually part of
    // (either as scout_id, or as the owner of the referenced player row)
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error || !data) {
      setLoadingConversations(false);
      return;
    }

    // conversations has no counterpart name on it - fetch the involved player rows
    // in one batch and merge them in, rather than a name column that doesn't exist.
    const playerIds = [...new Set(data.map((c) => c.player_id))];
    let playersById: Record<number, any> = {};

    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from("player")
        .select("id, full_name, photo_url, user_id")
        .in("id", playerIds);

      if (players) {
        playersById = Object.fromEntries(players.map((p) => [p.id, p]));
      }
    }

    const enriched = data.map((c) => ({
      ...c,
      player: playersById[c.player_id] || null,
    }));

    setConversations(enriched);
    setLoadingConversations(false);
  }

  async function loadMessages(conversationId: number) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (!error && data) {
      setMessages(data);
    }
  }

  function counterpartLabel(conversation: any) {
    if (!conversation) return "";
    const iAmScout = currentUserId === conversation.scout_id;
    if (iAmScout) {
      return conversation.player?.full_name || "Player";
    }
    return "Scout";
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
      .select()
      .single();

    setSending(false);

    if (error) {
      alert(error.message);
      return;
    }

    setMessages((prev) => [...prev, data]);
    setNewMessage("");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold text-green-700 mb-6 sm:mb-8">
          Messages
        </h1>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-md p-4">
            <h2 className="text-xl font-bold mb-4">Conversations</h2>

            {loadingConversations && (
              <p className="text-gray-500 text-sm">Loading conversations...</p>
            )}

            {!loadingConversations && conversations.length === 0 && (
              <p className="text-gray-500 text-sm">
                No conversations yet. Conversations start once a contact
                request has been accepted.
              </p>
            )}

            <div className="space-y-3">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => {
                    setSelectedConversation(conversation);
                    loadMessages(conversation.id);
                  }}
                  className={`border p-3 rounded-lg cursor-pointer hover:bg-gray-100 ${
                    selectedConversation?.id === conversation.id
                      ? "border-green-600 bg-green-50"
                      : ""
                  }`}
                >
                  {counterpartLabel(conversation)}
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-md p-4 sm:p-6">
            {!selectedConversation && (
              <div className="h-96 flex items-center justify-center text-gray-500 text-center px-4">
                Select a conversation to view messages.
              </div>
            )}

            {selectedConversation && (
              <>
                <h2 className="text-xl font-bold mb-6">
                  {counterpartLabel(selectedConversation)}
                </h2>

                <div className="space-y-4 h-96 overflow-y-auto">
                  {messages.length === 0 && (
                    <p className="text-gray-500 text-sm">
                      No messages yet. Say hello!
                    </p>
                  )}

                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.sender_id === currentUserId
                          ? "bg-green-600 text-white p-3 rounded-lg w-fit ml-auto max-w-[80%]"
                          : "bg-gray-100 p-3 rounded-lg w-fit max-w-[80%]"
                      }
                    >
                      {message.message}
                    </div>
                  ))}
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
