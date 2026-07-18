"use client"; 

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function EditProfile() {
  const [player, setPlayer] = useState<any>(null);   

  const [selectedProfilePhoto, setSelectedProfilePhoto] = useState<File | null>(null);
const [selectedCoverPhoto, setSelectedCoverPhoto] = useState<File | null>(null);
const [uploadingProfile, setUploadingProfile] = useState(false);
const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    loadPlayer();

  }, []);

  async function loadPlayer() {
    const {   
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("player")
      .select("*")
      .eq("email", user.email)
      .single();

    if (data) {
      setPlayer(data);
    }
  } 
  async function saveProfile() {
    const { data, error } = await supabase
  .from("player")
  .update({
    full_name: player.full_name,
    position: player.position,
    current_club: player.current_club,
    nationality: player.nationality,
    photo_url: player.photo_url,
    date_of_birth: player.date_of_birth,
    height: player.height,
    weight: player.weight,
    preferred_foot: player.preferred_foot,
    contract_expiry: player.contract_expiry,
    bio: player.bio,
  })
  .eq("id", player.id)
  .select();

 
  if (error) {
    alert(error.message);
  } else {
    alert("Profile updated successfully!");
  }
}

async function uploadProfilePhoto() {
  if (!selectedProfilePhoto || !player) return;

  const fileName = `profile-${player.id}-${Date.now()}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(fileName, selectedProfilePhoto, {
      upsert: true,
    });

  if (uploadError) {
    alert(uploadError.message);
    return;
  }

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(fileName);

  const imageUrl = data.publicUrl;

  const { error: updateError } = await supabase
  .from("player")
  .update({
  photo_url: imageUrl,
})
  .eq("id", player.id);

if (updateError) {
  console.error(updateError);
  alert(JSON.stringify(updateError));
  return;
}

setPlayer({
  ...player,
  photo_url: imageUrl,
});
alert("Profile photo uploaded!");
}

async function uploadCoverPhoto() {
  if (!selectedCoverPhoto || !player) return;

  const fileName = `cover-${player.id}-${Date.now()}`;

  const { error: uploadError } = await supabase.storage
    .from("cover-photos")
    .upload(fileName, selectedCoverPhoto, {
      upsert: true,
    });

  if (uploadError) {
  console.error(uploadError);
  alert(JSON.stringify(uploadError));
  return;
}

  const { data } = supabase.storage
    .from("cover-photos")
    .getPublicUrl(fileName);

  const imageUrl = data.publicUrl;

     const { error: updateError } = await supabase
  .from("player")
  .update({
    cover_photo_url: imageUrl,
  })
  .eq("id", player.id);

if (updateError) {
  console.error(updateError);
  alert(JSON.stringify(updateError));
  return;
}

  setPlayer({
  ...player,
  cover_photo_url: imageUrl,
});

  alert("Cover photo uploaded!");
}
  
  if (!player) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        Loading...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl p-8">

        <h1 className="text-4xl font-bold text-green-700 mb-8">
          Edit Profile
        </h1>
    <div className="mb-8">
  <div className="relative h-64 w-full rounded-2xl overflow-hidden bg-gray-300">

    <img     

         src={
  player.cover_photo_url ||
  "https://images.unsplash.com/photo-1508098682722-e99c643e7485?w=1200"
}
      
      alt="Cover"
      className="w-full h-full object-cover"
    />   

    <div className="absolute bottom-4 right-4 flex gap-2">

  <input
    type="file"
    accept="image/*"
    onChange={(e) =>
      setSelectedCoverPhoto(
        e.target.files ? e.target.files[0] : null
      )
    }
  />

  <button
    onClick={uploadCoverPhoto}
    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
  >
    Upload Cover
  </button>

</div>

  </div>
</div>

        <div className="space-y-5">
         

          <input
            className="w-full border rounded-lg p-3"
            value={player.full_name || ""} 
                        onChange={(e) =>
              setPlayer({ ...player, full_name: e.target.value })
            }
            placeholder="Full Name"
          /> 

          <input
  className="w-full border rounded-lg p-3"
  value={player.position || ""}
  onChange={(e) =>
    setPlayer({ ...player, position: e.target.value })
  }
  placeholder="Position"
/>

          <input
            className="w-full border rounded-lg p-3"
            value={player.current_club || ""}
            onChange={(e) =>
              setPlayer({ ...player, current_club: e.target.value })
            }
            placeholder="Current Club"
          /> 
    

          <input
            className="w-full border rounded-lg p-3"
            value={player.nationality || ""}
            onChange={(e) =>
              setPlayer({ ...player, nationality: e.target.value })
            }
            placeholder="Nationality"
          />

          <input
            className="w-full border rounded-lg p-3"
            type="number"
            value={player.height || ""}
            onChange={(e) =>
              setPlayer({ ...player, height: e.target.value })
            }
            placeholder="Height"
          />

          <input
            className="w-full border rounded-lg p-3"
            type="number"
            value={player.weight || ""}
            onChange={(e) =>
              setPlayer({ ...player, weight: e.target.value })
            }
            placeholder="Weight"
          />

          <input
            className="w-full border rounded-lg p-3"
            value={player.preferred_foot || ""}
            onChange={(e) =>
              setPlayer({ ...player, preferred_foot: e.target.value })
            }
            placeholder="Preferred Foot"     
          />   
    
    <label className="font-medium">Date of Birth</label>
          <input
  className="w-full border rounded-lg p-3"
  type="date"
  value={player.date_of_birth || ""}
  onChange={(e) =>
    setPlayer({ ...player, date_of_birth: e.target.value })
  }
  placeholder="Date of Birth"
/>

        <label className="font-medium">Contract Expiry</label>
          <input
            className="w-full border rounded-lg p-3"
            type="date"
            value={player.contract_expiry || ""}
            onChange={(e) =>
              setPlayer({ ...player, contract_expiry: e.target.value })
            }
          />

          <textarea
            className="w-full border rounded-lg p-3 h-40"
            value={player.bio || ""}
            onChange={(e) =>
              setPlayer({ ...player, bio: e.target.value })
            }
            placeholder="Biography"
          />

          <button
            onClick={saveProfile}
            className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold"
          >
            Save Profile
          </button>

        </div>
   
    
      </div>

    </main>
  );
}