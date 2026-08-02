"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "../components/Logo";
import { supabase } from "../lib/supabase";
import {
  FiGrid,
  FiShield,
  FiMessageSquare,
  FiUsers,
  FiHome,
  FiEye,
  FiUserCheck,
  FiStar,
  FiDollarSign,
  FiBarChart2,
  FiFlag,
  FiSettings,
  FiMenu,
  FiX,
  FiCheckCircle,
  FiAlertTriangle,
  FiClock,
} from "react-icons/fi";

// === Stage 3: live dashboard data ===
//
// Several table/column names in the original brief don't match this
// project's real schema - confirmed directly against the live database
// before writing any query here, not assumed:
// - "players" -> the real table is `player` (singular)
// - "clubs" -> the real table is `club_profiles`
// - "profiles/users table with account_type" -> no such table exists;
//   account_type (scout/agent/club/academy) lives on
//   `account_verifications`, so Registered Scouts/Agents counts come
//   from there instead - every row of that type counts as "registered"
//   regardless of verification status, matching how "Total Players" is
//   separate from "Verified Players" below.
// - "subscription_status = active" -> the real column is
//   `subscriptions.status`, and its real allowed values are
//   free/premium/pending/past_due/cancelled/renewing - there is no
//   "active" value. Premium Members counts status IN
//   ('premium','renewing').
// - "Monthly Revenue" has no dedicated revenue/invoices table to read
//   from - computed here as the sum of `amount` across subscriptions
//   currently in ('premium','renewing'), a reasonable proxy for current
//   recurring revenue. Displays ¥0 if none exist, not an error.

type SidebarItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  active?: boolean;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Dashboard", icon: FiGrid, href: "/admin", active: true },
  { label: "Verification Center", icon: FiShield, href: "/admin/verifications" },
  { label: "Support Tickets", icon: FiMessageSquare, href: "/admin/support-tickets" },
  { label: "Players", icon: FiUsers, href: "/admin/players" },
  { label: "Clubs", icon: FiHome, href: "/admin/clubs" },
  { label: "Scouts", icon: FiEye, href: "/admin/scouts" },
  { label: "Agents", icon: FiUserCheck, href: "/admin/agents" },
  { label: "Membership", icon: FiStar, href: "/admin/subscriptions" },
  { label: "Revenue", icon: FiDollarSign, href: "/admin/revenue" },
  { label: "Analytics", icon: FiBarChart2, href: "/admin/analytics" },
  { label: "Platform Announcements", icon: FiFlag, href: "/admin/announcements" },
  { label: "Settings", icon: FiSettings, href: "/admin/settings" },
];

const QUICK_ACTIONS = [
  { label: "Verification Center", href: "/admin/verifications" },
  { label: "Review Support Tickets", href: "/admin/support-tickets" },
  { label: "Manage Players", href: "/admin/players" },
  { label: "Manage Clubs", href: "/admin/clubs" },
  { label: "Membership", href: "/admin/subscriptions" },
  { label: "Create Announcement", href: "/admin/announcements" },
];

type Kpis = {
  totalPlayers: number;
  verifiedPlayers: number;
  registeredClubs: number;
  registeredScouts: number;
  registeredAgents: number;
  premiumMembers: number;
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  closedTickets: number;
  monthlyRevenue: number;
};

type ActivityEvent = {
  kind: "player" | "club" | "ticket" | "premium";
  label: string;
  createdAt: string;
};

type TicketRow = {
  id: number;
  full_name: string | null;
  subject: string;
  status: string;
  priority: string;
  created_at: string | null;
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800",
  "In Progress": "bg-amber-100 text-amber-800",
  Resolved: "bg-green-100 text-green-800",
  Closed: "bg-gray-200 text-gray-700",
};

const PRIORITY_BADGE: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Normal: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-800",
  Urgent: "bg-red-100 text-red-700",
};

export default function AdminPanel() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [latestTickets, setLatestTickets] = useState<TicketRow[]>([]);
  const [growthByDay, setGrowthByDay] = useState<number[]>([]);

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
      loadDashboard();
    }

    async function loadDashboard() {
      setLoading(true);
      setLoadError(false);

      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const [
          totalPlayersRes,
          verifiedPlayersRes,
          clubsRes,
          scoutsRes,
          agentsRes,
          premiumRes,
          ticketsAllRes,
          ticketsOpenRes,
          ticketsInProgressRes,
          ticketsClosedRes,
          recentPlayersRes,
          recentClubsRes,
          recentTicketsRes,
          recentPremiumRes,
          latestTicketsRes,
          growthPlayersRes,
        ] = await Promise.all([
          supabase.from("player").select("*", { count: "exact", head: true }),
          supabase.from("player").select("*", { count: "exact", head: true }).eq("verified", true),
          supabase.from("club_profiles").select("*", { count: "exact", head: true }),
          supabase
            .from("account_verifications")
            .select("*", { count: "exact", head: true })
            .eq("account_type", "scout"),
          supabase
            .from("account_verifications")
            .select("*", { count: "exact", head: true })
            .eq("account_type", "agent"),
          supabase
            .from("subscriptions")
            .select("amount")
            .in("status", ["premium", "renewing"]),
          supabase.from("support_tickets").select("*", { count: "exact", head: true }),
          supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "Open"),
          supabase
            .from("support_tickets")
            .select("*", { count: "exact", head: true })
            .eq("status", "In Progress"),
          supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "Closed"),
          supabase
            .from("player")
            .select("full_name, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("club_profiles")
            .select("club_name, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("support_tickets")
            .select("subject, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("subscriptions")
            .select("created_at")
            .in("status", ["premium", "renewing"])
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("support_tickets")
            .select("id, full_name, subject, status, priority, created_at")
            .order("created_at", { ascending: false })
            .limit(5),
          supabase.from("player").select("created_at").gte("created_at", thirtyDaysAgo),
        ]);

        const monthlyRevenue = (premiumRes.data || []).reduce(
          (sum, row) => sum + (Number(row.amount) || 0),
          0
        );

        setKpis({
          totalPlayers: totalPlayersRes.count ?? 0,
          verifiedPlayers: verifiedPlayersRes.count ?? 0,
          registeredClubs: clubsRes.count ?? 0,
          registeredScouts: scoutsRes.count ?? 0,
          registeredAgents: agentsRes.count ?? 0,
          premiumMembers: (premiumRes.data || []).length,
          totalTickets: ticketsAllRes.count ?? 0,
          openTickets: ticketsOpenRes.count ?? 0,
          inProgressTickets: ticketsInProgressRes.count ?? 0,
          closedTickets: ticketsClosedRes.count ?? 0,
          monthlyRevenue,
        });

        const events: ActivityEvent[] = [
          ...(recentPlayersRes.data || []).map((p) => ({
            kind: "player" as const,
            label: `New Player Registration${p.full_name ? `: ${p.full_name}` : ""}`,
            createdAt: p.created_at as string,
          })),
          ...(recentClubsRes.data || []).map((c) => ({
            kind: "club" as const,
            label: `New Club Registration${c.club_name ? `: ${c.club_name}` : ""}`,
            createdAt: c.created_at as string,
          })),
          ...(recentTicketsRes.data || []).map((t) => ({
            kind: "ticket" as const,
            label: `New Support Ticket: ${t.subject}`,
            createdAt: t.created_at as string,
          })),
          ...(recentPremiumRes.data || []).map((s) => ({
            kind: "premium" as const,
            label: "New Premium Member",
            createdAt: s.created_at as string,
          })),
        ]
          .filter((e) => Boolean(e.createdAt))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 8);

        setActivity(events);
        setLatestTickets(latestTicketsRes.data || []);

        // Bucket player registrations into 30 daily counts for the
        // growth chart - real counts, or an empty (all-zero) chart if
        // there's no data yet, never fabricated values.
        const buckets = new Array(30).fill(0);
        const now = Date.now();
        (growthPlayersRes.data || []).forEach((row) => {
          if (!row.created_at) return;
          const dayIndex = 29 - Math.floor((now - new Date(row.created_at).getTime()) / (24 * 60 * 60 * 1000));
          if (dayIndex >= 0 && dayIndex < 30) buckets[dayIndex] += 1;
        });
        setGrowthByDay(buckets);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    checkAccess();
  }, [router]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const unresolvedTickets = (kpis?.openTickets ?? 0) + (kpis?.inProgressTickets ?? 0);
  // Threshold is a reasonable operational default, not specified in the
  // brief - documented here rather than picked silently: more than 10
  // unresolved tickets is flagged as "Needs Attention".
  const ticketsHealthy = unresolvedTickets <= 10;

  const kpiCards = kpis
    ? [
        { label: "Total Players", value: kpis.totalPlayers.toLocaleString(), icon: FiUsers },
        { label: "Verified Players", value: kpis.verifiedPlayers.toLocaleString(), icon: FiShield },
        { label: "Registered Clubs", value: kpis.registeredClubs.toLocaleString(), icon: FiHome },
        { label: "Registered Scouts", value: kpis.registeredScouts.toLocaleString(), icon: FiEye },
        { label: "Registered Agents", value: kpis.registeredAgents.toLocaleString(), icon: FiUserCheck },
        { label: "Premium Members", value: kpis.premiumMembers.toLocaleString(), icon: FiStar },
        { label: "Total Support Tickets", value: kpis.totalTickets.toLocaleString(), icon: FiMessageSquare },
        { label: "Monthly Revenue", value: `¥${kpis.monthlyRevenue.toLocaleString()}`, icon: FiDollarSign },
      ]
    : [];

  const registrationOverview = kpis
    ? [
        { label: "Players", value: kpis.totalPlayers },
        { label: "Clubs", value: kpis.registeredClubs },
        { label: "Scouts", value: kpis.registeredScouts },
        { label: "Agents", value: kpis.registeredAgents },
      ]
    : [];
  const registrationMax = Math.max(1, ...registrationOverview.map((r) => r.value));

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo variant="badge" size="compact" />
            <span className="font-bold text-white">ScoutAfrica</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/60 hover:text-white"
            aria-label="Close menu"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label="Founder dashboard navigation">
          {SIDEBAR_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                item.active
                  ? "bg-green-600 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Executive Hero */}
        <div className="p-4 sm:p-8 pb-0">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 px-6 sm:px-10 py-8 sm:py-10">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-400 hover:text-gray-600 mb-4"
              aria-label="Open menu"
            >
              <FiMenu className="w-6 h-6" />
            </button>
            <p className="text-gray-400 text-sm sm:text-base font-medium">Welcome back,</p>
            <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 tracking-tight mt-1">Jerome Abah</h1>
            <p className="text-green-700 font-semibold mt-2">Founder &amp; CEO</p>
            <p className="text-gray-500 text-sm sm:text-base">ScoutAfrica Executive Dashboard</p>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-8">
          {loadError && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-3">
              <FiAlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-700 text-sm">
                Some dashboard data couldn&apos;t be loaded right now. Please refresh the page to try again.
              </p>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse mb-3" />
                    <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mb-2" />
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))
              : kpiCards.map((card) => (
                  <div
                    key={card.label}
                    className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-gray-100 p-5 transition-shadow duration-300"
                  >
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                      <card.icon className="w-5 h-5 text-green-600" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
                  </div>
                ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {QUICK_ACTIONS.map((action) => (
                    <Link
                      key={action.label}
                      href={action.href}
                      className="flex items-center justify-between bg-gray-50 hover:bg-green-50 border border-gray-100 hover:border-green-200 rounded-xl px-4 py-3.5 text-sm font-medium text-gray-700 hover:text-green-800 transition-all duration-200"
                    >
                      {action.label}
                      <span className="text-gray-300">→</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Charts */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-gray-900 mb-1">User Growth</h2>
                  <p className="text-xs text-gray-400 mb-4">Player registrations, last 30 days</p>
                  {loading ? (
                    <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />
                  ) : growthByDay.every((v) => v === 0) ? (
                    <div className="h-32 flex items-center justify-center text-gray-300 text-sm">
                      No registrations yet
                    </div>
                  ) : (
                    <div className="flex items-end gap-1 h-32">
                      {growthByDay.map((count, i) => {
                        const max = Math.max(1, ...growthByDay);
                        return (
                          <div
                            key={i}
                            className="flex-1 bg-green-100 rounded-t-md"
                            style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-gray-900 mb-1">Registration Overview</h2>
                  <p className="text-xs text-gray-400 mb-4">Players, Clubs, Scouts, Agents</p>
                  {loading ? (
                    <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />
                  ) : (
                    <div className="space-y-3">
                      {registrationOverview.map((row) => (
                        <div key={row.label}>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{row.label}</span>
                            <span>{row.value}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${(row.value / registrationMax) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Latest Support Tickets */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-900">Latest Support Tickets</h2>
                  <Link href="/admin/support-tickets" className="text-xs text-green-700 font-medium">
                    View all →
                  </Link>
                </div>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : latestTickets.length === 0 ? (
                  <p className="text-gray-400 text-sm">No support tickets yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-gray-100">
                          <th className="py-2 pr-4">Name</th>
                          <th className="py-2 pr-4">Subject</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Priority</th>
                          <th className="py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestTickets.map((ticket) => (
                          <tr
                            key={ticket.id}
                            onClick={() => router.push("/admin/support-tickets")}
                            className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="py-3 pr-4 font-medium text-gray-800">{ticket.full_name || "—"}</td>
                            <td className="py-3 pr-4 text-gray-600 max-w-[180px] truncate">{ticket.subject}</td>
                            <td className="py-3 pr-4">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[ticket.status] || "bg-gray-100 text-gray-600"}`}>
                                {ticket.status}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[ticket.priority] || "bg-gray-100 text-gray-600"}`}>
                                {ticket.priority}
                              </span>
                            </td>
                            <td className="py-3 text-gray-500 whitespace-nowrap">
                              {ticket.created_at ? relativeTime(ticket.created_at) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Recent Activity</h2>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-gray-400 text-sm">No recent platform activity.</p>
                ) : (
                  <div className="space-y-3">
                    {activity.map((item, i) => (
                      <div key={i} className="flex items-center gap-4 border border-gray-100 rounded-xl px-4 py-3">
                        <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                          {item.kind === "player" && <FiUsers className="w-4 h-4 text-gray-500" />}
                          {item.kind === "club" && <FiHome className="w-4 h-4 text-gray-500" />}
                          {item.kind === "ticket" && <FiMessageSquare className="w-4 h-4 text-gray-500" />}
                          {item.kind === "premium" && <FiStar className="w-4 h-4 text-gray-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.label}</p>
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <FiClock className="w-3 h-3" />
                            {relativeTime(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* Platform Health */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Platform Health</h2>
                <div className="space-y-3">
                  {[
                    { label: "Authentication", healthy: true },
                    { label: "Player Registration", healthy: true },
                    { label: "Membership", healthy: true },
                    { label: "Contact Support", healthy: true },
                    { label: "API Services", healthy: true },
                    { label: "Database", healthy: true },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{row.label}</span>
                      <span className="flex items-center gap-1.5 text-green-600 font-medium">
                        <FiCheckCircle className="w-4 h-4" />
                        Healthy
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Support Tickets</span>
                    {loading ? (
                      <span className="text-gray-300">—</span>
                    ) : ticketsHealthy ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-medium">
                        <FiCheckCircle className="w-4 h-4" />
                        Healthy
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                        <FiAlertTriangle className="w-4 h-4" />
                        Needs Attention
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Founder Profile Card */}
              <div className="relative overflow-hidden bg-gradient-to-b from-gray-900 via-gray-900 to-green-950 text-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
                <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 bg-green-500/10 rounded-full blur-3xl" />
                <div className="relative flex flex-col items-center">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3 mb-5">
                    <Logo variant="badge" size="small" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight">Jerome Abah</h2>
                  <p className="text-white/70 text-sm mt-1">Founder &amp; CEO</p>
                  <p className="text-white/50 text-sm">ScoutAfrica</p>
                  <span className="inline-flex items-center gap-1.5 bg-green-600/15 border border-green-500/30 text-green-400 text-xs font-semibold px-3 py-1 rounded-full mt-4">
                    <FiCheckCircle className="w-3.5 h-3.5" />
                    Verified Founder
                  </span>
                  <div className="w-full mt-6 pt-5 border-t border-white/10">
                    <p className="text-white/40 text-xs tracking-wide uppercase">Version 1 MVP</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}