"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * ScoutAfrica — Contact Page
 * Route: /contact
 *
 * Self-contained page component. No modifications made to any other
 * route, layout, navigation, footer, or backend configuration.
 *
 * Backend integration notes:
 * - `handleSubmit` currently simulates a network request.
 * - Replace the body of `submitToBackend` with a real call to a
 *   Supabase `support_tickets` insert (and file upload to storage)
 *   once that table/bucket exists. The payload shape below already
 *   matches a reasonable `support_tickets` schema.
 */

type ContactReason =
  | ""
  | "General Question"
  | "Premium Subscription"
  | "Payment Issue"
  | "Report a Bug"
  | "Player Verification"
  | "Club / Scout Account"
  | "Partnership / Sponsorship"
  | "Report a User"
  | "Other";

interface ContactFormState {
  fullName: string;
  email: string;
  reason: ContactReason;
  subject: string;
  message: string;
  file: File | null;
}

interface ContactFormErrors {
  fullName?: string;
  email?: string;
  reason?: string;
  subject?: string;
  message?: string;
  file?: string;
}

const REASON_OPTIONS: ContactReason[] = [
  "General Question",
  "Premium Subscription",
  "Payment Issue",
  "Report a Bug",
  "Player Verification",
  "Club / Scout Account",
  "Partnership / Sponsorship",
  "Report a User",
  "Other",
];

const ACCEPTED_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitStatus = "idle" | "submitting" | "success" | "error";

async function submitToBackend(payload: {
  fullName: string;
  email: string;
  reason: ContactReason;
  subject: string;
  message: string;
  file: File | null;
}): Promise<{ ok: boolean }> {
  try {
    const formData = new FormData();
    formData.append("fullName", payload.fullName);
    formData.append("email", payload.email);
    formData.append("reason", payload.reason);
    formData.append("subject", payload.subject);
    formData.append("message", payload.message);
    if (payload.file) {
      formData.append("attachment", payload.file);
    }

    const response = await fetch("/api/support/tickets", {
      method: "POST",
      body: formData,
    });

    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
}

  

function classNames(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function ContactPage() {
  const [form, setForm] = useState<ContactFormState>({
    fullName: "",
    email: "",
    reason: "",
    subject: "",
    message: "",
    file: null,
  });
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateField<K extends keyof ContactFormState>(
    key: K,
    value: ContactFormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const nextErrors: ContactFormErrors = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = "Please enter your full name.";
    }

    if (!form.email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!form.reason) {
      nextErrors.reason = "Please select a reason for contact.";
    }

    if (!form.subject.trim()) {
      nextErrors.subject = "Please enter a subject.";
    }

    if (!form.message.trim()) {
      nextErrors.message = "Please enter a message.";
    } else if (form.message.trim().length < 10) {
      nextErrors.message = "Your message should be at least 10 characters.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    if (!file) {
      updateField("file", null);
      setFileName("");
      return;
    }

    if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        file: "Only PDF, PNG or JPG files are accepted.",
      }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileName("");
      updateField("file", null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        file: `File must be smaller than ${MAX_FILE_SIZE_MB} MB.`,
      }));
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileName("");
      updateField("file", null);
      return;
    }

    setErrors((prev) => ({ ...prev, file: undefined }));
    setFileName(file.name);
    updateField("file", file);
  }

  function clearFile() {
    updateField("file", null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    setForm({
      fullName: "",
      email: "",
      reason: "",
      subject: "",
      message: "",
      file: null,
    });
    setErrors({});
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setStatus("submitting");

    try {
      const result = await submitToBackend({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        reason: form.reason,
        subject: form.subject.trim(),
        message: form.message.trim(),
        file: form.file,
      });

      setStatus(result.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  function handleModalDone() {
    setStatus("idle");
    resetForm();
  }

  function handleModalRetry() {
    setStatus("idle");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50/40 via-white to-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-emerald-100">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-200/30 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-6 pb-8 pt-10 text-center sm:pt-14">
          <div className="mb-1 flex justify-center">
            <div className="flex justify-center mb-8">
  <Image
    src="/branding/scoutafrica-logo-hero.png"
    alt="ScoutAfrica Logo"
    width={320}
    height={90}
    className="h-auto w-auto max-w-[320px]"
    priority
  />
</div>
          </div>
          <div className="-mt-8">
          <h1 className="text-4xl font-bold tracking-tight text-emerald-600 sm:text-5xl">
            Contact Us
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            We&apos;re here to help. Whether you&apos;re a player, scout,
            club, academy, agent or partner, our team is ready to assist you.
          </p> 
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-5xl px-6 pt-2 pb-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Contact us via Email
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Our support team is ready to answer your questions and help
                  you with your ScoutAfrica account.
                </p>

                <dl className="mt-4 space-y-4">
                  <ContactRow
                    label="General Enquiries"
                    value="info@myscoutafrica.com"
                  />
                </dl>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Support Hours
                </h2>
                <p className="mt-2 text-sm text-gray-700">
                  Monday – Friday
                  <br />
                  09:00 – 18:00 UTC
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Average response time:{" "}
                  <span className="font-medium text-gray-700">
                    24–48 hours
                  </span>
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-600 p-5 text-white shadow-sm">
                <div className="flex items-start gap-3">
                  <CheckShieldIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <p className="text-sm leading-relaxed">
                    We reply to every genuine enquiry. Our team reviews every
                    message personally.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — FORM */}
          <div className="lg:col-span-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7">
              
              <form
                noValidate
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="fullName"
                    label="Full Name"
                    error={errors.fullName}
                  >
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(e) =>
                        updateField("fullName", e.target.value)
                      }
                      aria-invalid={!!errors.fullName}
                      aria-describedby={
                        errors.fullName ? "fullName-error" : undefined
                      }
                      className={inputClasses(!!errors.fullName)}
                      placeholder="John Doe"
                    />
                  </Field>

                  <Field id="email" label="Email Address" error={errors.email}>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      aria-invalid={!!errors.email}
                      aria-describedby={
                        errors.email ? "email-error" : undefined
                      }
                      className={inputClasses(!!errors.email)}
                      placeholder="you@example.com"
                    />
                  </Field>
                </div>

                <Field
                  id="reason"
                  label="Reason for Contact"
                  error={errors.reason}
                >
                  <select
                    id="reason"
                    name="reason"
                    value={form.reason}
                    onChange={(e) =>
                      updateField("reason", e.target.value as ContactReason)
                    }
                    aria-invalid={!!errors.reason}
                    aria-describedby={
                      errors.reason ? "reason-error" : undefined
                    }
                    className={classNames(
                      inputClasses(!!errors.reason),
                      "appearance-none bg-white"
                    )}
                  >
                    <option value="" disabled>
                      Select a reason
                    </option>
                    {REASON_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="subject" label="Subject" error={errors.subject}>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    value={form.subject}
                    onChange={(e) => updateField("subject", e.target.value)}
                    aria-invalid={!!errors.subject}
                    aria-describedby={
                      errors.subject ? "subject-error" : undefined
                    }
                    className={inputClasses(!!errors.subject)}
                    placeholder="Brief summary of your enquiry"
                  />
                </Field>

                <Field id="message" label="Message" error={errors.message}>
                  <textarea
                    id="message"
                    name="message"
                    rows={4}
                    value={form.message}
                    onChange={(e) => updateField("message", e.target.value)}
                    aria-invalid={!!errors.message}
                    aria-describedby={
                      errors.message ? "message-error" : undefined
                    }
                    className={classNames(
                      inputClasses(!!errors.message),
                      "resize-none"
                    )}
                    placeholder="Tell us how we can help..."
                  />
                </Field>

                <div>
                  <label
                    htmlFor="attachment"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Attachment{" "}
                    <span className="font-normal text-gray-400">
                      (optional)
                    </span>
                  </label>
                  <div className="mt-1.5">
                    <div
                      className={classNames(
                        "flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-2.5",
                        errors.file
                          ? "border-red-300 bg-red-50"
                          : "border-gray-200 bg-gray-50"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <PaperclipIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate text-sm text-gray-600">
                          {fileName || "PDF, PNG or JPG — max 10MB"}
                        </span>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {fileName && (
                          <button
                            type="button"
                            onClick={clearFile}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            Remove
                          </button>
                        )}
                        <label
                          htmlFor="attachment"
                          className="cursor-pointer whitespace-nowrap rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50"
                        >
                          {fileName ? "Change" : "Upload"}
                        </label>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      id="attachment"
                      name="attachment"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={handleFileChange}
                      className="sr-only"
                      aria-describedby={
                        errors.file ? "file-error" : undefined
                      }
                    />
                  </div>
                  {errors.file && (
                    <p
                      id="file-error"
                      role="alert"
                      className="mt-1.5 text-sm text-red-600"
                    >
                      {errors.file}
                    </p>
                  )}
                </div>

                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={resetForm}
                    disabled={status === "submitting"}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "submitting" && <SpinnerIcon className="h-4 w-4" />}
                    {status === "submitting" ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </form>
            </div>

            <p className="mt-3 text-center text-xs text-gray-400 sm:text-left">
              Prefer email? Reach us anytime at{" "}
              <Link
                href="mailto:info@myscoutafrica.com"
                className="font-medium text-emerald-700 hover:underline"
              >
                info@myscoutafrica.com
              </Link>
            </p>
          </div>
        </div>
      </section>

      {status === "success" && <SuccessModal onDone={handleModalDone} />}
      {status === "error" && (
        <ErrorModal
          onRetry={handleModalRetry}
          onClose={() => setStatus("idle")}
        />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------- */
/* Subcomponents                                                        */
/* -------------------------------------------------------------------- */

function ContactRow({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5">
        <Link
          href={`mailto:${value}`}
          className="text-sm font-medium text-gray-900 hover:text-emerald-700"
        >
          {value}
        </Link>
        {caption && (
          <span className="ml-2 text-xs text-gray-400">({caption})</span>
        )}
      </dd>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClasses(hasError: boolean) {
  return classNames(
    "block w-full rounded-xl border px-4 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400",
    "focus:outline-none focus:ring-2 focus:ring-offset-0",
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-gray-200 focus:border-emerald-400 focus:ring-emerald-100"
  );
}

function SuccessModal({ onDone }: { onDone: () => void }) {
  return (
    <ModalOverlay labelledBy="success-title">
      <div className="flex flex-col items-center px-8 py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircleIcon className="h-9 w-9 animate-[pop_0.4s_ease-out] text-emerald-600" />
        </div>
        <h2
          id="success-title"
          className="text-xl font-semibold text-gray-900"
        >
          Thank You!
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
          Your message has been successfully sent to ScoutAfrica. Our support
          team will review it and respond within 24–48 hours.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-6 w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:w-auto sm:px-10"
        >
          Done
        </button>
      </div>
      <style>{`
        @keyframes pop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); }
        }
      `}</style>
    </ModalOverlay>
  );
}

function ErrorModal({
  onRetry,
  onClose,
}: {
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <ModalOverlay labelledBy="error-title">
      <div className="flex flex-col items-center px-8 py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ErrorIcon className="h-9 w-9 text-red-600" />
        </div>
        <h2 id="error-title" className="text-xl font-semibold text-gray-900">
          Something Went Wrong
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
          We couldn&apos;t send your message right now. Please check your
          connection and try again.
        </p>
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Retry
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({
  children,
  labelledBy,
}: {
  children: React.ReactNode;
  labelledBy: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="w-full max-w-md animate-[fadeScale_0.25s_ease-out] rounded-2xl bg-white shadow-xl">
        {children}
      </div>
      <style>{`
        @keyframes fadeScale {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Icons (inline SVG — no external icon dependency)                     */
/* -------------------------------------------------------------------- */

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.64 17.56a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function CheckShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={classNames("animate-spin", className)}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}