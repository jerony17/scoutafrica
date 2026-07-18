"use client"

import { useState } from "react"

 
import { supabase } from "../lib/supabase";
export default function RegisterPlayer() {





const [fullName, setFullName] = useState("")
const [age, setAge] = useState("")
const [nationality, setNationality] = useState("")
const [position, setPosition] = useState("")
const [currentClub, setCurrentClub] = useState("") 
const [photo, setPhoto] = useState<File | null>(null)
const handleSubmit = async (e: any) => {
  e.preventDefault() 

// Get logged in user
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  alert("Please sign in first.");
  return;
}

// Generate ScoutAfrica ID
const scoutAfricaId =
  "SA-" + Math.floor(100000 + Math.random() * 900000);

let photoUrl = ""

if (photo) {
  const fileName = `${Date.now()}-${photo.name}`

  const { error: uploadError } = await supabase.storage
    .from("player-photos")
    .upload(fileName, photo)

  if (uploadError) {
    alert(uploadError.message)
    return
  }

  const { data } = supabase.storage
    .from("player-photos")
    .getPublicUrl(fileName)

  photoUrl = data.publicUrl
}


  const { data, error } = await supabase
    .from("player") 

    .insert([
  {
    full_name: fullName,
    age: Number(age),
    nationality,
    position,
    current_club: currentClub,
    photo_url: photoUrl,

    email: user.email,
    user_id: user.id,
    scoutafrica_id: scoutAfricaId,
  },
])

  if (error) {
    console.log(error)
    alert(error.message)
  } else {
    alert("Player registered successfully")
    console.log(data)
  }
}

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50">

      <h1 className="text-4xl font-bold text-green-700 mb-8">
        Player Registration
      </h1>

      <form
  onSubmit={handleSubmit}
  className="w-full max-w-xl bg-white p-8 rounded-2xl shadow-md"
>

        <input
  type="text"
  placeholder="Full Name"
  value={fullName}
  onChange={(e) => setFullName(e.target.value)}
  className="w-full border p-3 rounded mb-4"
/>

     

        

        <input
  type="number"
  placeholder="Age"
  value={age}
  onChange={(e) => setAge(e.target.value)}
  className="w-full border p-3 rounded mb-4"
/> 
<input
  type="text"
  placeholder="Nationality"
  value={nationality}
  onChange={(e) => setNationality(e.target.value)}
  className="w-full border p-3 rounded mb-4"
/>
      

        <input
  type="text"
  placeholder="Position"
  value={position}
  onChange={(e) => setPosition(e.target.value)}
  className="w-full border p-3 rounded mb-4"
/>
        <input
  type="text"
  placeholder="Current Club"
  value={currentClub}
  onChange={(e) => setCurrentClub(e.target.value)}
  className="w-full border p-3 rounded mb-4"
/>

 <div className="mb-4">
  <label className="block mb-2 font-semibold">
    Player Photo
  </label>

  <input
    type="file"
    accept="image/*"
    
  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        console.log(e.target.files[0])
        setPhoto(e.target.files[0])
    }
}}
    className="w-full border p-3 rounded"
  />
</div>

<button
  type="submit"
  className="w-full bg-green-600 text-white p-3 rounded mt-4"
>
  Submit Profile
</button>
      </form>

    </main>
  );
}