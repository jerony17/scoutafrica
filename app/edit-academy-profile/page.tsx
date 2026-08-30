"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isAcademyProfile } from "../lib/types";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function EditAcademyProfile() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [academyName, setAcademyName] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      if (user.user_metadata?.account_type !== "academy") {
        router.replace("/");
        return;
      }

      setUserId(user.id);

      const { data: profile } = await supabase
        .from("academy_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile && isAcademyProfile(profile)) {
        setAcademyName(profile.academy_name || "");
        setDescription(profile.description || "");
        setCountry(profile.country || "");
        setCity(profile.city || "");
        setWebsite(profile.website || "");
        setLogoUrl(profile.logo_url);
        setCoverUrl(profile.cover_photo_url);
      }

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  function validateImage(file: File): boolean {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert("Please upload a JPG, PNG, or WEBP image.");
      return false;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      alert("Image is too large. Maximum size is 5MB.");
      return false;
    }
    return true;
  }

  async function uploadLogo(file: File) {
    if (!validateImage(file) || !userId) return;

    setUploadingLogo(true);

    const filePath = `${userId}/logo-${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("academy-logos").upload(filePath, file, {
      upsert: true,
    });

    if (uploadError) {
      setUploadingLogo(false);
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("academy-logos").getPublicUrl(filePath);
    setLogoUrl(data.publicUrl);
    setUploadingLogo(false);
  }

  async function uploadCover(file: File) {
    if (!validateImage(file) || !userId) return;

    setUploadingCover(true);

    const filePath = `${userId}/cover-${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("academy-covers").upload(filePath, file, {
      upsert: true,
    });

    if (uploadError) {
      setUploadingCover(false);
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("academy-covers").getPublicUrl(filePath);
    setCoverUrl(data.publicUrl);
    setUploadingCover(false);
  }

  async function saveProfile() {
    if (!userId) return;

    if (!academyName.trim()) {
      alert("Please enter your academy name.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("academy_profiles").upsert(
      {
        user_id: userId,
        academy_name: academyName.trim(),
        description: description.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        website: website.trim() || null,
        logo_url: logoUrl,
        cover_photo_url: coverUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Academy profile saved successfully!");
    router.push("/academy-dashboard");
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-8">Edit Academy Profile</h1>

        {/* Cover photo */}
        <div className="mb-6">
          <label className="block font-semibold mb-2">Academy Cover Photo</label>
          <div className="relative h-48 w-full rounded-2xl overflow-hidden bg-gray-200">
            {coverUrl && <Image src={coverUrl} alt="Academy cover" fill className="object-cover" />}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadCover(file);
            }}
          />
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="mt-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {uploadingCover ? "Uploading..." : coverUrl ? "Replace Cover Photo" : "Upload Cover Photo"}
          </button>
        </div>

        {/* Logo */}
        <div className="mb-8 flex items-center gap-4">
          <div className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow shrink-0">
            {logoUrl && <Image src={logoUrl} alt="Academy logo" fill className="object-cover" />}
          </div>
          <div>
            <label className="block font-semibold mb-2">Academy Logo</label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadLogo(file);
              }}
            />
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {uploadingLogo ? "Uploading..." : logoUrl ? "Replace Logo" : "Upload Logo"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academy Name</label>
            <input
              value={academyName}
              onChange={(e) => setAcademyName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="e.g. Lagos City Football Academy"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About the Academy</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full border rounded-lg p-3"
              placeholder="Tell players and scouts about your academy's development program..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full border rounded-lg p-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border rounded-lg p-3"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Official Website <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="https://..."
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold disabled:opacity-50 mt-4"
          >
            {saving ? "Saving..." : "Save Academy Profile"}
          </button>
        </div>
      </div>
    </main>
  );
}