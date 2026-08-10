"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { isFounderProfile } from "../../lib/types";
import type { FounderProfile } from "../../lib/types";
import { FiArrowLeft, FiSave, FiAlertCircle } from "react-icons/fi";

// Admin-only edit controls for the public founder_profile row. The
// actual public display lives in app/components/FounderSection.tsx on
// the About Us page - this page only writes to the table; RLS (admin-
// only UPDATE, tested directly against live data) is what actually
// enforces that only an admin can change it, this page's own auth
// check is a second layer, not the only one.

const LIST_FIELDS = ["mission_points", "core_values", "industry_tags"] as const;

export default function FounderProfileEditPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [profile, setProfile] = useState<FounderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // List fields are edited as one line per item, joined/split on save/load.
  const [missionText, setMissionText] = useState("");
  const [valuesText, setValuesText] = useState("");
  const [industryText, setIndustryText] = useState("");

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
      loadProfile();
    }

    async function loadProfile() {
      setLoading(true);
      setLoadError(false);

      const { data, error } = await supabase.from("founder_profile").select("*").eq("id", 1).single();

      if (error || !isFounderProfile(data)) {
        console.error("Failed to load founder profile:", error);
        setLoadError(true);
        setLoading(false);
        return;
      }

      setProfile(data);
      setMissionText((data.mission_points || []).join("\n"));
      setValuesText((data.core_values || []).join("\n"));
      setIndustryText((data.industry_tags || []).join("\n"));
      setLoading(false);
    }

    checkAccess();
  }, [router]);

  function updateField<K extends keyof FounderProfile>(field: K, value: FounderProfile[K]) {
    setProfile((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (!profile) return;

    setSaving(true);
    setSaveError(null);

    const { error } = await supabase
      .from("founder_profile")
      .update({
        full_name: profile.full_name,
        position: profile.position,
        company: profile.company,
        country: profile.country,
        country_flag: profile.country_flag,
        current_base: profile.current_base,
        current_base_flag: profile.current_base_flag,
        photo_url: profile.photo_url,
        message: profile.message,
        mission_points: missionText.split("\n").map((s) => s.trim()).filter(Boolean),
        vision: profile.vision,
        core_values: valuesText.split("\n").map((s) => s.trim()).filter(Boolean),
        industry_tags: industryText.split("\n").map((s) => s.trim()).filter(Boolean),
        platform_founded: profile.platform_founded,
        active_since: profile.active_since,
        current_version: profile.current_version,
        countries_served: profile.countries_served,
        players_connected: profile.players_connected,
      })
      .eq("id", 1);

    setSaving(false);

    if (error) {
      console.error("Failed to save founder profile:", error);
      setSaveError("Something went wrong saving your changes. Please try again.");
      return;
    }

    setSavedAt(Date.now());
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent";

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-green-700 text-sm font-medium mb-4">
          <FiArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Founder Profile</h1>
        <p className="text-gray-500 mt-1 mb-6">
          Edit the Founder &amp; CEO section shown publicly on the About Us page.
        </p>

        {loadError && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-3 mb-6">
            <FiAlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-700 text-sm">Couldn&apos;t load the founder profile. Please refresh to try again.</p>
          </div>
        )}

        {loading || !profile ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-white rounded-2xl shadow-sm border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Full Name</label>
                <input
                  value={profile.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Position</label>
                <input
                  value={profile.position}
                  onChange={(e) => updateField("position", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Company</label>
                <input
                  value={profile.company}
                  onChange={(e) => updateField("company", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Photo URL</label>
                <input
                  value={profile.photo_url || ""}
                  onChange={(e) => updateField("photo_url", e.target.value)}
                  placeholder="/branding/founder-jerome-abah.png"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Country</label>
                <input
                  value={profile.country || ""}
                  onChange={(e) => updateField("country", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Country Flag (emoji)</label>
                <input
                  value={profile.country_flag || ""}
                  onChange={(e) => updateField("country_flag", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Current Base</label>
                <input
                  value={profile.current_base || ""}
                  onChange={(e) => updateField("current_base", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Current Base Flag (emoji)</label>
                <input
                  value={profile.current_base_flag || ""}
                  onChange={(e) => updateField("current_base_flag", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Founder&apos;s Message</label>
              <textarea
                value={profile.message || ""}
                onChange={(e) => updateField("message", e.target.value)}
                style={{ minHeight: "140px" }}
                className={inputClass + " resize-y"}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Mission <span className="text-gray-400 font-normal">(one point per line)</span>
              </label>
              <textarea
                value={missionText}
                onChange={(e) => setMissionText(e.target.value)}
                style={{ minHeight: "100px" }}
                className={inputClass + " resize-y"}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">Vision</label>
              <textarea
                value={profile.vision || ""}
                onChange={(e) => updateField("vision", e.target.value)}
                style={{ minHeight: "80px" }}
                className={inputClass + " resize-y"}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Core Values <span className="text-gray-400 font-normal">(one per line)</span>
              </label>
              <textarea
                value={valuesText}
                onChange={(e) => setValuesText(e.target.value)}
                style={{ minHeight: "100px" }}
                className={inputClass + " resize-y"}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1.5">
                Industry Tags <span className="text-gray-400 font-normal">(one per line)</span>
              </label>
              <textarea
                value={industryText}
                onChange={(e) => setIndustryText(e.target.value)}
                style={{ minHeight: "80px" }}
                className={inputClass + " resize-y"}
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Platform Founded</label>
                <input
                  value={profile.platform_founded || ""}
                  onChange={(e) => updateField("platform_founded", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Active Since</label>
                <input
                  value={profile.active_since || ""}
                  onChange={(e) => updateField("active_since", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Current Version</label>
                <input
                  value={profile.current_version || ""}
                  onChange={(e) => updateField("current_version", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Countries Served</label>
                <input
                  value={profile.countries_served || ""}
                  onChange={(e) => updateField("countries_served", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Players Connected</label>
                <input
                  value={profile.players_connected || ""}
                  onChange={(e) => updateField("players_connected", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
            {savedAt && !saveError && <p className="text-green-600 text-sm">Saved successfully.</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50"
            >
              <FiSave className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
