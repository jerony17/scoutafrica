"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    setSubmitted(true);
  }

  return (
    <main className="min-h-screen flex justify-center items-center bg-gray-100">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-lg">
        <h1 className="text-4xl font-bold text-center text-green-700 mb-3">
          Forgot Password
        </h1>

        {submitted ? (
          <>
            <p className="text-center text-gray-500 mb-8">
              If an account exists for <strong>{email}</strong>, a password reset link
              has been sent. Check your inbox (and spam folder).
            </p>
            <Link
              href="/signin"
              className="block w-full text-center bg-green-600 text-white p-3 rounded-xl hover:bg-green-700"
            >
              Back to Sign In
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="text-center text-gray-500 mb-8">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>

            <input
              type="email"
              placeholder="Email"
              required
              className="w-full border p-3 rounded mb-6"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white p-3 rounded-xl hover:bg-green-700"
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>

            <p className="text-center text-gray-500 mt-6">
              <Link href="/signin" className="text-green-700 hover:underline">
                Back to Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
