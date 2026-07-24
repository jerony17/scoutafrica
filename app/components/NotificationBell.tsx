"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isArrayOf, isNotification } from "../lib/types";
import type { Notification } from "../lib/types";

// Rendered globally from the root layout (no shared nav bar exists yet in
// this project - see the layout.tsx comment). Renders nothing when signed
// out, so it never appears on public pages like signin/signup/home for a
// visitor, and doesn't require touching any existing page.
export default function NotificationBell() {
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [acting, setActing] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setUserId(user?.id ?? null);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    async function loadNotifications() {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        console.error("NotificationBell: failed to load notifications:", error);
        return;
      }

      setNotifications(isArrayOf(data, isNotification) ? data : []);
    }

    loadNotifications();

    // Simple polling refresh rather than a full Realtime subscription -
    // keeps this sprint scoped to "notifications work correctly" without
    // adding a second real-time system.
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markAsRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) console.error(error);
  }

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    const { error } = await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    if (error) console.error(error);
  }

  // Accept/Decline mirrors player-dashboard/requests exactly. Conversation
  // creation + notifications happen automatically via
  // trg_create_conversation_on_approval (migration 020) as soon as status
  // becomes 'accepted' - no client-side insert needed here anymore.
  async function respondToContactRequest(notification: Notification, status: "accepted" | "rejected") {
    if (!notification.related_id) return;

    setActing(notification.id);

    const { error } = await supabase
      .from("contact_requests")
      .update({ status })
      .eq("id", notification.related_id);

    setActing(null);

    if (error) {
      alert(error.message);
      return;
    }

    markAsRead(notification.id);
  }

  if (!userId) return null;

  return (
    <div ref={containerRef} className="fixed top-4 right-4 z-40">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative bg-black text-white w-11 h-11 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 transition"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-gray-100">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
            <p className="font-bold text-gray-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-green-700 font-semibold hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-gray-400 text-sm px-4 py-8 text-center">
              No notifications yet.
            </p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  onClick={() => !notification.read && markAsRead(notification.id)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer transition ${
                    notification.read ? "bg-white" : "bg-green-50"
                  } hover:bg-gray-50`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.read && (
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-green-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-900">{notification.title}</p>
                      <p className="text-sm text-gray-600">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {notification.created_at
                          ? new Date(notification.created_at).toLocaleString()
                          : ""}
                      </p>

                      {notification.type === "contact_request_new" && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respondToContactRequest(notification, "accepted");
                            }}
                            disabled={acting === notification.id}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            Accept Contact
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respondToContactRequest(notification, "rejected");
                            }}
                            disabled={acting === notification.id}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            Decline Contact
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
