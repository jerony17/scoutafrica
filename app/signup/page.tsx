"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const [accountType, setAccountType] = useState("player");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!agreedToTerms) {
      alert("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

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

    // Club and Scout accounts have no profile table of their own (only
    // player does) - this is the record the Admin Control Center's
    // verification queue reads from. Best-effort: if there's no active
    // session yet (email confirmation required), this silently doesn't
    // insert - the row isn't required for signup itself to succeed, and
    // account_type is still stored on the auth user either way.
    if ((accountType === "club" || accountType === "scout") && data.user) {
      const { error: verificationError } = await supabase
        .from("account_verifications")
        .insert({
          user_id: data.user.id,
          account_type: accountType,
          display_name: fullName,
          email,
        });

      if (verificationError) {
        console.error("signup: could not create verification record:", verificationError);
      }
    }

    alert(
      "Account created successfully! Please check your email to verify your account."
    );
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

        <label className="flex items-start gap-2 text-sm text-gray-600 mb-6">
          <input
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-1"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms-of-service" target="_blank" className="text-green-700 underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy-policy" target="_blank" className="text-green-700 underline">
              Privacy Policy
            </Link>
            . If I am under 18, I confirm a parent or guardian has reviewed
            and consented to these terms on my behalf.
          </span>
        </label>

        <button
          type="submit"
          disabled={loading || !agreedToTerms}
          className="w-full bg-green-600 text-white p-3 rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Account"}
        </button>

      </form>

    </main>
  );
}