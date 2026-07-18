"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const [accountType, setAccountType] = useState("player");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: any) {
    e.preventDefault();

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          country,
          account_type: accountType,
        },
      },
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert(
      "Account created successfully! Please check your email to verify your account."
    );

    console.log(data);
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gray-100">

      <form
        onSubmit={handleSignup}
        className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-lg"
      >

        <h1 className="text-4xl font-bold text-center text-green-700 mb-8">
          ScoutAfrica
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Create your account
        </p>

        <label className="font-semibold">
          I am a
        </label>

        <select
          className="w-full border p-3 rounded mt-2 mb-5"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          <option value="player">Football Player</option>
          <option value="scout">Scout</option>
          <option value="club">Football Club</option>
          <option value="agent">Football Agent</option>
        </select>

        <input
          className="w-full border p-3 rounded mb-4"
          placeholder="Full Name"
          value={fullName}
          onChange={(e)=>setFullName(e.target.value)}
        />

        <input
          className="w-full border p-3 rounded mb-4"
          placeholder="Country"
          value={country}
          onChange={(e)=>setCountry(e.target.value)}
        />

        <input
          className="w-full border p-3 rounded mb-4"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />

        <input
          className="w-full border p-3 rounded mb-6"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white p-3 rounded-xl hover:bg-green-700"
        >
          {loading ? "Creating..." : "Create Account"}
        </button>

      </form>

    </main>
  );
}