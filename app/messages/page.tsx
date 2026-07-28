"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import PremiumBadge from "../components/PremiumBadge";
import { isPremium } from "../lib/isPremium";
import { isArrayOf, isMessage, isMessageAttachment } from "../lib/types";
import type { ConversationWithPlayer, Message, MessageAttachment, Player } from "../lib/types";

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

// Presentation-only helpers - no data fetching, no business logic.
function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (first + last).toUpperCase() || "?";
}

function formatPreviewTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
];
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string): string {
  if (fileType.startsWith("image/")) return "🖼️";
  if (fileType === "application/pdf") return "📄";
  if (fileType.includes("word")) return "📝";
  if (fileType.includes("sheet") || fileType.includes("excel")) return "📊";
  if (fileType.includes("presentation") || fileType.includes("powerpoint")) return "📽️";
  return "📎";
}

export default function Messages() {
  const [conversations, setConversations] = useState<ConversationWithPlayer[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithPlayer | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [lastMessageByConversation, setLastMessageByConversation] = useState<
    Record<number, { text: string; created_at: string | null }>
  >({});
  const [unreadByConversation, setUnreadByConversation] = useState<Record<number, number>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<number, MessageAttachment[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;
      if (!user) return;

      // Root cause fix: postgres_changes enforces RLS on the Realtime
      // WebSocket connection itself, which does not automatically inherit
      // the REST session used by regular .from() queries. Without this,
      // Realtime treats the connection as unauthenticated, so RLS
      // (sender_id = auth.uid() OR receiver_id = auth.uid()) silently
      // blocks every incoming event for both users - matching the exact
      // symptom reported (sender sees their own message via local state,
      // the other party never receives it via Realtime).
      if (session.access_token) {
        supabase.realtime.setAuth(session.access_token);
        console.log("[Realtime] Called setAuth() with the current session's access token");
      }

      setCurrentUserId(user.id);
      isPremium(user.id).then(setUserIsPremium);
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

      const messageIds = data.map((m) => m.id);
      if (messageIds.length > 0) {
        const { data: attachments } = await supabase
          .from("message_attachments")
          .select("*")
          .in("message_id", messageIds);

        if (isArrayOf(attachments, isMessageAttachment)) {
          const grouped: Record<number, MessageAttachment[]> = {};
          for (const a of attachments) {
            grouped[a.message_id] = grouped[a.message_id] || [];
            grouped[a.message_id].push(a);
          }
          setAttachmentsByMessage(grouped);
        }
      }

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

    console.log("[Realtime] Creating channel for conversation.id:", selectedConversation.id);

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
          console.log("[Realtime] postgres_changes event received. Full payload:", payload);
          console.log("[Realtime] Current selectedConversation.id at event time:", selectedConversation.id);

          const row = payload.new;
          if (isMessage(row)) {
            console.log("[Realtime] payload.new passed isMessage() check - calling setMessages()");
            setMessages((prev) => {
              console.log("[Realtime] message count BEFORE setMessages():", prev.length);
              const next = prev.some((m) => m.id === row.id) ? prev : [...prev, row];
              console.log("[Realtime] message count AFTER setMessages():", next.length);
              return next;
            });
            if (row.receiver_id === currentUserId) {
              supabase.from("messages").update({ read: true }).eq("id", row.id).then();
            }
            supabase
              .from("message_attachments")
              .select("*")
              .eq("message_id", row.id)
              .then(({ data: attachments }) => {
                if (isArrayOf(attachments, isMessageAttachment) && attachments.length > 0) {
                  setAttachmentsByMessage((prev) => ({ ...prev, [row.id]: attachments }));
                }
              });
          } else {
            console.log("[Realtime] payload.new FAILED isMessage() check - setMessages() NOT called. Raw value:", row);
          }
        }
      )
      .subscribe((status) => {
        console.log("[Realtime] Subscription status changed:", status);
      });

    return () => {
      console.log("[Realtime] Cleaning up channel for conversation.id:", selectedConversation.id);
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
    if ((!text && !selectedFile) || !selectedConversation || !currentUserId) return;

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
        message: text, // empty string is valid - "a message may contain text, a file, or both"
      })
      .select("id, created_at")
      .single();

    if (error || !data || typeof data.id !== "number") {
      setSending(false);
      alert(error?.message || "Failed to send message.");
      return;
    }

    let newAttachment: MessageAttachment | null = null;

    if (selectedFile) {
      const filePath = `${selectedConversation.id}/${Date.now()}-${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("message-files")
        .upload(filePath, selectedFile);

      if (uploadError) {
        setSending(false);
        alert(`Message sent, but the file failed to upload: ${uploadError.message}`);
      } else {
        const { data: attachmentRow, error: attachmentError } = await supabase
          .from("message_attachments")
          .insert({
            message_id: data.id,
            file_name: selectedFile.name,
            file_size: selectedFile.size,
            file_type: selectedFile.type,
            storage_path: filePath,
          })
          .select("*")
          .single();

        if (!attachmentError && isMessageAttachment(attachmentRow)) {
          newAttachment = attachmentRow;
        }
      }
    }

    setSending(false);

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

    if (newAttachment) {
      setAttachmentsByMessage((prev) => ({ ...prev, [data.id]: [newAttachment as MessageAttachment] }));
    }

    setNewMessage("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setLastMessageByConversation((prev) => ({
      ...prev,
      [selectedConversation.id]: { text: text || `📎 ${selectedFile?.name || "Attachment"}`, created_at: sentMessage.created_at },
    }));
  }

  function handleFileSelect(file: File | null) {
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      alert("Unsupported file type. Allowed: PDF, DOC, DOCX, XLSX, PPTX, JPG, JPEG, PNG.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert("File is too large. Maximum size is 20MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  }

  async function downloadAttachment(attachment: MessageAttachment) {
    const { data, error } = await supabase.storage
      .from("message-files")
      .createSignedUrl(attachment.storage_path, 60);

    if (error || !data?.signedUrl) {
      alert("Could not generate a download link for this file.");
      return;
    }

    window.open(data.signedUrl, "_blank");
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <p className="text-green-700 text-xs font-semibold tracking-[0.18em] uppercase mb-1">
            ScoutAfrica
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">
            Messages
          </h1>
        </div>

        <div className="grid md:grid-cols-[340px_1fr] gap-5 sm:gap-6">
          {/* Conversation list */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col md:h-[75vh] overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingConversations && (
                <div className="p-4 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-11 h-11 rounded-full bg-gray-200 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-gray-200 rounded w-2/3" />
                        <div className="h-2.5 bg-gray-100 rounded w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loadingConversations && filteredConversations.length === 0 && (
                <p className="text-gray-400 text-sm text-center px-6 py-10">
                  {conversations.length === 0
                    ? "No conversations yet. Conversations start once a contact request has been approved."
                    : "No conversations match your search."}
                </p>
              )}

              <div className="divide-y divide-gray-50">
                {filteredConversations.map((conversation) => {
                  const last = lastMessageByConversation[conversation.id];
                  const unread = unreadByConversation[conversation.id] || 0;
                  const isSelected = selectedConversation?.id === conversation.id;
                  const label = counterpartLabel(conversation);
                  const iAmScout = currentUserId === conversation.scout_id;
                  const avatarUrl = iAmScout ? conversation.player?.photo_url : null;
                  const counterpartUserId = iAmScout ? conversation.player?.user_id : conversation.scout_id;

                  return (
                    <button
                      key={conversation.id}
                      onClick={() => {
                        setSelectedConversation(conversation);
                        loadMessages(conversation.id);
                      }}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3.5 transition ${
                        isSelected
                          ? "bg-green-50 border-l-4 border-green-600 pl-3"
                          : "border-l-4 border-transparent hover:bg-gray-50"
                      }`}
                    >
                      <div className="relative w-11 h-11 rounded-full overflow-hidden bg-gray-800 shrink-0 flex items-center justify-center">
                        {avatarUrl ? (
                          <Image src={avatarUrl} alt={label} fill className="object-cover" />
                        ) : (
                          <span className="text-white text-sm font-semibold">
                            {getInitials(label)}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-sm flex items-center gap-1.5 min-w-0 ${
                              unread > 0 ? "font-bold text-gray-900" : "font-medium text-gray-800"
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {counterpartUserId && <PremiumBadge userId={counterpartUserId} />}
                          </p>
                          <span className="text-[11px] text-gray-400 shrink-0">
                            {formatPreviewTime(last?.created_at || conversation.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p
                            className={`truncate text-xs ${
                              unread > 0 ? "text-gray-700 font-medium" : "text-gray-400"
                            }`}
                          >
                            {last?.text || "No messages yet"}
                          </p>
                          {unread > 0 && (
                            <span className="bg-green-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shrink-0">
                              {unread > 9 ? "9+" : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chat thread */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col md:h-[75vh] overflow-hidden">
            {!selectedConversation && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-2xl mb-1">
                  💬
                </div>
                <p className="text-gray-500 font-medium">Select a conversation</p>
                <p className="text-gray-400 text-sm max-w-xs">
                  Choose someone from the list to view your ScoutAfrica conversation.
                </p>
              </div>
            )}

            {selectedConversation && (
              <>
                {(() => {
                  const iAmScout = currentUserId === selectedConversation.scout_id;
                  const avatarUrl = iAmScout ? selectedConversation.player?.photo_url : null;
                  const label = counterpartLabel(selectedConversation);
                  const counterpartUserId = iAmScout
                    ? selectedConversation.player?.user_id
                    : selectedConversation.scout_id;
                  return (
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                      <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-800 shrink-0 flex items-center justify-center">
                        {avatarUrl ? (
                          <Image src={avatarUrl} alt={label} fill className="object-cover" />
                        ) : (
                          <span className="text-white text-xs font-semibold">
                            {getInitials(label)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-gray-900 truncate flex items-center gap-2">
                          {label}
                          {counterpartUserId && <PremiumBadge userId={counterpartUserId} />}
                        </h2>
                        <p className="text-xs text-gray-400 italic">Typing indicator coming soon</p>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 bg-gray-50/50">
                  {messages.length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-10">
                      No messages yet. Say hello!
                    </p>
                  )}

                  {messages.map((message) => {
                    const isMine = message.sender_id === currentUserId;
                    const attachments = attachmentsByMessage[message.id] || [];
                    return (
                      <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[75%] sm:max-w-[65%]">
                          <div
                            className={
                              isMine
                                ? "bg-green-600 text-white px-4 py-2.5 rounded-2xl rounded-br-md"
                                : "bg-white text-gray-800 px-4 py-2.5 rounded-2xl rounded-bl-md border border-gray-100 shadow-sm"
                            }
                          >
                            {message.message && (
                              <p className="text-sm leading-relaxed break-words">{message.message}</p>
                            )}

                            {attachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                onClick={() => downloadAttachment(attachment)}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2 mt-2 w-full text-left transition ${
                                  isMine
                                    ? "bg-green-700 hover:bg-green-800"
                                    : "bg-gray-50 hover:bg-gray-100 border border-gray-100"
                                }`}
                              >
                                <span className="text-xl shrink-0">{getFileIcon(attachment.file_type)}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs font-medium truncate">
                                    {attachment.file_name}
                                  </span>
                                  <span
                                    className={`block text-[11px] ${isMine ? "text-green-100" : "text-gray-400"}`}
                                  >
                                    {formatFileSize(attachment.file_size)}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                          <p
                            className={`text-[11px] text-gray-400 mt-1 px-1 ${
                              isMine ? "text-right" : "text-left"
                            }`}
                          >
                            {message.created_at
                              ? new Date(message.created_at).toLocaleTimeString(undefined, {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : ""}
                            {isMine && (message.read ? " · Read" : " · Sent")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <div className="p-3 sm:p-4 border-t border-gray-100">
                  {!userIsPremium && messages.length === 0 ? (
                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
                      <p className="text-sm text-amber-800">
                        ⭐ Starting a new conversation requires ScoutAfrica Premium.
                      </p>
                      <a
                        href="/membership"
                        className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Upgrade
                      </a>
                    </div>
                  ) : (
                    <>
                      {selectedFile && (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2 text-xs">
                          <span>{getFileIcon(selectedFile.type)}</span>
                          <span className="flex-1 truncate">{selectedFile.name}</span>
                          <span className="text-gray-400">{formatFileSize(selectedFile.size)}</span>
                          <button
                            onClick={() => handleFileSelect(null)}
                            aria-label="Remove attachment"
                            className="text-gray-400 hover:text-gray-600 font-bold px-1"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full pl-2 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-green-500 focus-within:border-transparent">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          aria-label="Attach a file"
                          className="text-gray-400 hover:text-green-700 w-8 h-8 rounded-full flex items-center justify-center transition shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                            />
                          </svg>
                        </button>

                        <input
                          type="text"
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendMessage();
                          }}
                          placeholder="Type a message..."
                          className="flex-1 bg-transparent text-sm py-1.5 focus:outline-none placeholder-gray-400"
                        />

                        <button
                          onClick={sendMessage}
                          disabled={sending || (!newMessage.trim() && !selectedFile)}
                          aria-label="Send message"
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white w-9 h-9 rounded-full flex items-center justify-center transition shrink-0"
                        >
                          {sending ? (
                            <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M2.94 2.94a1.5 1.5 0 011.61-.35l12.5 5a1.5 1.5 0 010 2.82l-12.5 5a1.5 1.5 0 01-2.03-1.83L3.9 10 2.52 4.77a1.5 1.5 0 01.42-1.83z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
