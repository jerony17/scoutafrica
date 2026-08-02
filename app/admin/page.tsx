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
  FiTrendingUp,
  FiTrendingDown,
  FiCheckCircle,
  FiClock,
} from "react-icons/fi";

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

type KpiCard = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  trendUp: boolean;
};

const KPI_CARDS: KpiCard[] = [
  { label: "Total Players", value: "2,458", icon: FiUsers, trend: "+4.2%", trendUp: true },
  { label: "Verified Players", value: "1,190", icon: FiShield, trend: "+2.8%", trendUp: true },
  { label: "Registered Clubs", value: "156", icon: FiHome, trend: "+1.1%", trendUp: true },
  { label: "Registered Scouts", value: "312", icon: FiEye, trend: "+3.5%", trendUp: true },
  { label: "Registered Agents", value: "64", icon: FiUserCheck, trend: "+0.9%", trendUp: true },
  { label: "Premium Members", value: "189", icon: FiStar, trend: "+6.4%", trendUp: true },
  { label: "Open Support Tickets", value: "23", icon: FiMessageSquare, trend: "-1.2%", trendUp: false },
  { label: "Monthly Revenue", value: "¥1,240,000", icon: FiDollarSign, trend: "+8.1%", trendUp: true },
];

type QuickAction = { label: string; href: string };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Review Verification Requests", href: "/admin/verifications" },
  { label: "View Support Tickets", href: "/admin/support-tickets" },
  { label: "Manage Players", href: "/admin/players" },
  { label: "Manage Clubs", href: "/admin/clubs" },
  { label: "Manage Membership", href: "/admin/subscriptions" },
  { label: "Create Announcement", href: "/admin/announcements" },
];

type ActivityItem = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  timestamp: string;
  status: string;
  statusColor: string;
};

const RECENT_ACTIVITY: ActivityItem[] = [
  { icon: FiStar, title: "New Premium Member", timestamp: "12 minutes ago", status: "Active", statusColor: "bg-green-100 text-green-800" },
  { icon: FiShield, title: "Club Verification Submitted", timestamp: "48 minutes ago", status: "Pending", statusColor: "bg-amber-100 text-amber-800" },
  { icon: FiUsers, title: "Player Registration", timestamp: "1 hour ago", status: "Completed", statusColor: "bg-green-100 text-green-800" },
  { icon: FiMessageSquare, title: "Support Ticket Received", timestamp: "2 hours ago", status: "Open", statusColor: "bg-blue-100 text-blue-800" },
];

const PLATFORM_HEALTH = [
  "Authentication",
  "Player Registration",
  "Membership",
  "Contact Support",
  "API Services",
  "Database",
];

const GROWTH_BARS = [40, 52, 48, 61, 58, 70, 66, 78, 82, 90, 95, 100];
const REVENUE_BARS = [30, 35, 33, 42, 48, 45, 55, 60, 58, 68, 75, 80];

export default function AdminPanel() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

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
        {/* Executive Hero Section */}
        <div className="p-4 sm:p-8 pb-0">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 px-6 sm:px-10 py-4 sm:py-5">
            <div className="flex items-start justify-between gap-4 mb-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Open menu"
              >
                <FiMenu className="w-6 h-6" />
              </button>
              <p className="text-xs sm:text-sm text-gray-400 font-medium ml-auto">{today}</p>
            </div>

            <p className="text-gray-400 text-sm sm:text-base font-medium">Welcome back,</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mt-1">
              Jerome Abah
            </h1>
            <p className="text-green-700 font-semibold mt-2">Founder &amp; CEO</p>
            <p className="text-gray-500 text-sm sm:text-base">ScoutAfrica Executive Dashboard</p>

            <p className="text-gray-600 text-base sm:text-lg leading-relaxed max-w-2xl mt-3">
              &ldquo;Helping African football talents connect with professional opportunities worldwide.&rdquo;
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mt-5">
              <Link
                href="/admin/verifications"
                className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
              >
                <FiCheckCircle className="w-4 h-4" />
                Review Verification Requests
              </Link>
              <Link
                href="/admin/support-tickets"
                className="inline-flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-green-600 hover:text-green-700 text-gray-700 font-semibold px-6 py-3 rounded-xl transition-all duration-200"
              >
                <FiMessageSquare className="w-4 h-4" />
                View Support Tickets
              </Link>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8 space-y-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {KPI_CARDS.map((card) => (
              <div
                key={card.label}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-gray-100 p-5 transition-shadow duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                  <card.icon className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
                <p
                  className={`text-xs font-medium mt-2 flex items-center gap-1 ${
                    card.trendUp ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {card.trendUp ? <FiTrendingUp className="w-3.5 h-3.5" /> : <FiTrendingDown className="w-3.5 h-3.5" />}
                  {card.trend}
                </p>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
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

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-gray-900 mb-1">User Growth</h2>
                  <p className="text-xs text-gray-400 mb-4">Placeholder - not yet connected to live data</p>
                  <div className="flex items-end gap-1.5 h-32">
                    {GROWTH_BARS.map((height, i) => (
                      <div key={i} className="flex-1 bg-green-100 rounded-t-md" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <h2 className="font-bold text-gray-900 mb-1">Monthly Revenue</h2>
                  <p className="text-xs text-gray-400 mb-4">Placeholder - not yet connected to live data</p>
                  <div className="flex items-end gap-1.5 h-32">
                    {REVENUE_BARS.map((height, i) => (
                      <div key={i} className="flex-1 bg-amber-100 rounded-t-md" style={{ height: `${height}%` }} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Recent Activity</h2>
                <div className="space-y-3">
                  {RECENT_ACTIVITY.map((item, i) => (
                    <div key={i} className="flex items-center gap-4 border border-gray-100 rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                        <item.icon className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <FiClock className="w-3 h-3" />
                          {item.timestamp}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${item.statusColor}`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 mb-4">Platform Health</h2>
                <div className="space-y-3">
                  {PLATFORM_HEALTH.map((label) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className="flex items-center gap-1.5 text-green-600 font-medium">
                        <FiCheckCircle className="w-4 h-4" />
                        Healthy
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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