"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isClubPrivateInfo, isClubProfile } from "../lib/types";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function EditClubProfile() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [clubName, setClubName] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [foundedYear, setFoundedYear] = useState("");
  const [stadium, setStadium] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

      if (user.user_metadata?.account_type !== "club") {
        router.replace("/");
        return;
      }

      setUserId(user.id);

      const [profileResult, privateResult] = await Promise.all([
        supabase.from("club_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("club_private_info").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (profileResult.data && isClubProfile(profileResult.data)) {
        const p = profileResult.data;
        setClubName(p.club_name || "");
        setDescription(p.description || "");
        setCountry(p.country || "");
        setCity(p.city || "");
        setFoundedYear(p.founded_year ? String(p.founded_year) : "");
        setStadium(p.stadium || "");
        setWebsite(p.website || "");
        setLogoUrl(p.logo_url);
        setCoverUrl(p.cover_photo_url);
      }

      if (privateResult.data && isClubPrivateInfo(privateResult.data)) {
        setEmail(privateResult.data.email || "");
        setPhone(privateResult.data.phone || "");
      } else {
        setEmail(user.email || "");
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

    const { error: uploadError } = await supabase.storage.from("club-logos").upload(filePath, file, {
      upsert: true,
    });

    if (uploadError) {
      setUploadingLogo(false);
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("club-logos").getPublicUrl(filePath);
    setLogoUrl(data.publicUrl);
    setUploadingLogo(false);
  }

  async function uploadCover(file: File) {
    if (!validateImage(file) || !userId) return;

    setUploadingCover(true);

    const filePath = `${userId}/cover-${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("club-covers").upload(filePath, file, {
      upsert: true,
    });

    if (uploadError) {
      setUploadingCover(false);
      alert(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("club-covers").getPublicUrl(filePath);
    setCoverUrl(data.publicUrl);
    setUploadingCover(false);
  }

  async function saveProfile() {
    if (!userId) return;

    if (!clubName.trim()) {
      alert("Please enter your club name.");
      return;
    }

    setSaving(true);

    const parsedYear = foundedYear ? Number(foundedYear) : null;

    const { error: profileError } = await supabase.from("club_profiles").upsert(
      {
        user_id: userId,
        club_name: clubName.trim(),
        description: description.trim() || null,
        country: country.trim() || null,
        city: city.trim() || null,
        founded_year: parsedYear && Number.isFinite(parsedYear) ? parsedYear : null,
        stadium: stadium.trim() || null,
        website: website.trim() || null,
        logo_url: logoUrl,
        cover_photo_url: coverUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (profileError) {
      setSaving(false);
      alert(profileError.message);
      return;
    }

    const { error: privateError } = await supabase.from("club_private_info").upsert(
      {
        user_id: userId,
        email: email.trim() || null,
        phone: phone.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    setSaving(false);

    if (privateError) {
      alert(privateError.message);
      return;
    }

    alert("Club profile saved successfully!");
    router.push("/club-dashboard");
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
        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-8">Edit Club Profile</h1>

        {/* Cover photo */}
        <div className="mb-6">
          <label className="block font-semibold mb-2">Club Cover Photo</label>
          <div className="relative h-48 w-full rounded-2xl overflow-hidden bg-gray-200">
            {coverUrl && <Image src={coverUrl} alt="Club cover" fill className="object-cover" />}
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
            {logoUrl && <Image src={logoUrl} alt="Club logo" fill className="object-cover" />}
          </div>
          <div>
            <label className="block font-semibold mb-2">Club Logo</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Club Name</label>
            <input
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="w-full border rounded-lg p-3"
              placeholder="e.g. Lagos City FC"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About the Club</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full border rounded-lg p-3"
              placeholder="Tell players and scouts about your club..."
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Founded Year</label>
              <input
                type="number"
                value={foundedYear}
                onChange={(e) => setFoundedYear(e.target.value)}
                className="w-full border rounded-lg p-3"
                placeholder="e.g. 1998"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stadium</label>
              <input
                value={stadium}
                onChange={(e) => setStadium(e.target.value)}
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

          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-semibold text-gray-500 mb-1">
              🔒 Private information - never shown on your public profile
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-lg p-3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Club Phone Number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border rounded-lg p-3"
                />
              </div>
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold disabled:opacity-50 mt-4"
          >
            {saving ? "Saving..." : "Save Club Profile"}
          </button>
        </div>
      </div>
    </main>
  );
}
