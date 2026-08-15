"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { supabase } from "@/app/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage(
      "If an account exists with this email, you will receive a password reset link shortly."
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg border">
        <h1 className="text-3xl font-bold text-green-600 text-center">
          Forgot Password?
        </h1>

        <p className="mt-2 text-center text-gray-600">
          Enter your email and we&apos;ll send you a password reset link.
        </p>

        <form onSubmit={handleReset} className="mt-6 space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-500 py-3 font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-center text-green-600">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 text-center text-red-500">
            {error}
          </p>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/signin"
            className="text-sm text-green-600 hover:underline"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}