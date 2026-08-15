"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { isArrayOf, isAdvertisement } from "../../lib/types";
import type { Advertisement, AdPlacement, AdStatus } from "../../lib/types";

const PLACEMENTS: AdPlacement[] = [
  "Homepage",
  "Player Profiles",
  "Find Players",
  "Club Pages",
  "Dashboard",
  "All Website",
];

const STATUSES: AdStatus[] = [
  "Draft",
  "Pending",
  "Active",
  "Paused",
  "Expired",
];

const STATUS_BADGE: Record<AdStatus, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Pending: "bg-amber-100 text-amber-800",
  Active: "bg-green-100 text-green-800",
  Paused: "bg-blue-100 text-blue-800",
  Expired: "bg-red-100 text-red-700",
};

type FormState = {
  id: number | null;
  title: string;
  advertiser_name: string;
  description: string;
  destination_url: string;
  placement: AdPlacement;
  start_date: string;
  end_date: string;
  status: AdStatus;
  imageFile: File | null;
  existingImageUrl: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  advertiser_name: "",
  description: "",
  destination_url: "",
  placement: "All Website",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  status: "Draft",
  imageFile: null,
  existingImageUrl: "",
};

export default function AdvertisingAdmin() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [reloadIndex, setReloadIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

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

    async function loadAds() {
      const { data, error } = await supabase
        .from("advertisements")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      setAds(isArrayOf(data, isAdvertisement) ? data : []);
    }

    loadAds();
  }, [checkingAccess, reloadIndex]);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(ad: Advertisement) {
    setForm({
      id: ad.id,
      title: ad.title,
      advertiser_name: ad.advertiser_name,
      description: ad.description || "",
      destination_url: ad.destination_url,
      placement: ad.placement,
      start_date: ad.start_date ? ad.start_date.slice(0, 10) : "",
      end_date: ad.end_date ? ad.end_date.slice(0, 10) : "",
      status: ad.status,
      imageFile: null,
      existingImageUrl: ad.image_url || "",
    });

    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    let imageUrl = form.existingImageUrl;

    if (form.imageFile) {
      const fileName = `${Date.now()}-${form.imageFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("advertisement-images")
        .upload(fileName, form.imageFile);

      if (uploadError) {
        setSaving(false);
        alert(uploadError.message);
        return;
      }

      const { data } = supabase.storage
        .from("advertisement-images")
        .getPublicUrl(fileName);

      imageUrl = data.publicUrl;
    }

    const payload = {
      title: form.title,
      advertiser_name: form.advertiser_name,
      description: form.description || null,
      image_url: imageUrl || null,
      destination_url: form.destination_url,
      placement: form.placement,
      start_date: form.start_date,
      end_date: form.end_date || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    const { error } = form.id
      ? await supabase
          .from("advertisements")
          .update(payload)
          .eq("id", form.id)
      : await supabase.from("advertisements").insert(payload);

    setSaving(false);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    setShowForm(false);
    setReloadIndex((i) => i + 1);
  }

  async function toggleActivePause(ad: Advertisement) {
    const newStatus: AdStatus =
      ad.status === "Active" ? "Paused" : "Active";

    const { error } = await supabase
      .from("advertisements")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ad.id);

    if (error) {
      alert(error.message);
      return;
    }

    setReloadIndex((i) => i + 1);
  }

  async function deleteAd(ad: Advertisement) {
    if (!confirm(`Delete "${ad.title}"? This cannot be undone.`)) return;

    const { error } = await supabase
      .from("advertisements")
      .delete()
      .eq("id", ad.id);

    if (error) {
      alert(error.message);
      return;
    }

    setReloadIndex((i) => i + 1);
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const totalAds = ads.length;
  const activeAds = ads.filter((a) => a.status === "Active").length;
  const pendingAds = ads.filter((a) => a.status === "Pending").length;
  const totalImpressions = ads.reduce(
    (sum, a) => sum + a.impressions,
    0
  );
  const totalClicks = ads.reduce(
    (sum, a) => sum + a.clicks,
    0
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin"
          className="text-green-700 text-sm font-medium"
        >
          ← Back to Admin Dashboard
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-green-700">
            Advertising
          </h1>

          <button
            onClick={openCreateForm}
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold"
          >
            + New Advertisement
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total Ads" value={totalAds} />
          <StatCard label="Active Ads" value={activeAds} />
          <StatCard label="Pending Ads" value={pendingAds} />
          <StatCard
            label="Total Impressions"
            value={totalImpressions}
          />
          <StatCard label="Total Clicks" value={totalClicks} />
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-5">
                {form.id
                  ? "Edit Advertisement"
                  : "New Advertisement"}
              </h2>

              <form onSubmit={handleSave} className="space-y-4">
                <input
                  className="w-full border rounded-lg p-3"
                  placeholder="Title"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                    })
                  }
                />

                <input
                  className="w-full border rounded-lg p-3"
                  placeholder="Advertiser Name"
                  required
                  value={form.advertiser_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      advertiser_name: e.target.value,
                    })
                  }
                />

                <textarea
                  className="w-full border rounded-lg p-3"
                  placeholder="Description"
                  rows={3}
                  value={form.description}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      description: e.target.value,
                    })
                  }
                />

                <input
                  className="w-full border rounded-lg p-3"
                  type="url"
                  placeholder="Destination URL"
                  required
                  value={form.destination_url}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      destination_url: e.target.value,
                    })
                  }
                />

                <div>
                  <label className="font-medium text-sm">
                    Advertisement Image
                  </label>

                  {form.existingImageUrl && !form.imageFile && (
                    <Image
                      src={form.existingImageUrl}
                      alt="Current ad image"
                      width={200}
                      height={100}
                      className="rounded-lg mt-2 mb-2 object-cover"
                    />
                  )}

                  <input
                    className="w-full border rounded-lg p-3 mt-1"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      setForm({
                        ...form,
                        imageFile:
                          e.target.files?.[0] || null,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="font-medium text-sm">
                    Placement
                  </label>

                  <select
                    className="w-full border rounded-lg p-3 mt-1"
                    value={form.placement}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        placement:
                          e.target.value as AdPlacement,
                      })
                    }
                  >
                    {PLACEMENTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-sm">
                      Start Date
                    </label>

                    <input
                      className="w-full border rounded-lg p-3 mt-1"
                      type="date"
                      required
                      value={form.start_date}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          start_date: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="font-medium text-sm">
                      End Date
                    </label>

                    <input
                      className="w-full border rounded-lg p-3 mt-1"
                      type="date"
                      value={form.end_date}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          end_date: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="font-medium text-sm">
                    Status
                  </label>

                  <select
                    className="w-full border rounded-lg p-3 mt-1"
                    value={form.status}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        status: e.target.value as AdStatus,
                      })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl font-semibold disabled:opacity-50"
                  >
                    {saving
                      ? "Saving..."
                      : form.id
                      ? "Save Changes"
                      : "Create Advertisement"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 rounded-xl font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {ads.length === 0 && (
          <p className="text-gray-500">
            No advertisements yet. Create one to get started.
          </p>
        )}

        <div className="space-y-3">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="bg-white rounded-xl shadow-sm p-5 flex flex-wrap gap-4 items-start"
            >
              {ad.image_url ? (
                <Image
                  src={ad.image_url}
                  alt={ad.title}
                  width={120}
                  height={70}
                  className="rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-[120px] h-[70px] rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs shrink-0">
                  No image
                </div>
              )}

              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900">
                    {ad.title}
                  </p>

                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[ad.status]}`}
                  >
                    {ad.status}
                  </span>
                </div>

                <p className="text-sm text-gray-500">
                  {ad.advertiser_name} · {ad.placement}
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  {ad.start_date
                    ? new Date(
                        ad.start_date
                      ).toLocaleDateString()
                    : "—"}
                  {" – "}
                  {ad.end_date
                    ? new Date(
                        ad.end_date
                      ).toLocaleDateString()
                    : "No end date"}
                </p>

                <p className="text-xs text-gray-400 mt-1">
                  {ad.impressions.toLocaleString()} impressions ·{" "}
                  {ad.clicks.toLocaleString()} clicks
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={ad.destination_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg"
                >
                  View
                </a>

                <button
                  onClick={() => openEditForm(ad)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg"
                >
                  Edit
                </button>

                {(ad.status === "Active" ||
                  ad.status === "Paused") && (
                  <button
                    onClick={() => toggleActivePause(ad)}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm px-4 py-2 rounded-lg"
                  >
                    {ad.status === "Active"
                      ? "Pause"
                      : "Activate"}
                  </button>
                )}

                <button
                  onClick={() => deleteAd(ad)}
                  className="bg-red-100 hover:bg-red-200 text-red-700 text-sm px-4 py-2 rounded-lg"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}