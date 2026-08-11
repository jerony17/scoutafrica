"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase"; 
import Link from "next/link";

export default function SignIn() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    const accountType =
      data.user?.user_metadata?.account_type;

    if (accountType === "player") {
      router.push("/player-dashboard");
    } else if (accountType === "scout") {
      router.push("/scout-dashboard");
    } else if (accountType === "club") {
      router.push("/club-dashboard");
    } else if (accountType === "agent") {
      router.push("/agent-dashboard");
    } else {
      alert("Unknown account type.");
    }
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gray-100">

      <form
        onSubmit={handleLogin}
        className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-lg"
      >

        <h1 className="text-4xl font-bold text-center text-green-700 mb-3">
          Welcome Back
        </h1>

        <p className="text-center text-gray-500 mb-8">
          Sign in to ScoutAfrica
        </p>

        <input
          type="email"
          placeholder="Email"
          className="w-full border p-3 rounded mb-4"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded mb-6"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />    
         <div className="text-right mt-2">
  <Link
    href="/forgot-password"
    className="text-sm text-green-600 hover:underline"
  >
    Forgot Password?
  </Link>
</div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white p-3 rounded-xl hover:bg-green-700"
        >
          {loading ? "Signing In..." : "Sign In"}
        </button>

      </form>

    </main>
  );
}