"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { isAccountVerification, isArrayOf, isVerificationDocument } from "../lib/types";
import type { AccountVerification, VerificationDocument } from "../lib/types";

const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const DOCUMENT_LABELS: Record<VerificationDocument["document_type"], string> = {
  business_registration: "Business Registration",
  fa_license: "Football Association License",
  government_registration: "Government Registration",
  supporting: "Supporting Document",
};

export default function VerificationPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [userId, setUserId] = useState("");
  const [accountType, setAccountType] = useState<"club" | "scout" | "agent" | "academy">("club");
  const [application, setApplication] = useState<AccountVerification | null>(null);
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [website, setWebsite] = useState("");

  const fileInputRefs = {
    business_registration: useRef<HTMLInputElement>(null),
    fa_license: useRef<HTMLInputElement>(null),
    government_registration: useRef<HTMLInputElement>(null),
    supporting: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      const type = user.user_metadata?.account_type;
      if (type !== "club" && type !== "scout" && type !== "agent" && type !== "academy") {
        router.replace("/");
        return;
      }

      setUserId(user.id);
      setAccountType(type);
      setCheckingAccess(false);
      loadApplication(user.id);
    }

    init();
  }, [router]);

  async function loadApplication(uid: string) {
    const { data } = await supabase
      .from("account_verifications")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();

    if (data && isAccountVerification(data)) {
      setApplication(data);
      setOrgName(data.organization_name || "");
      setCountry(data.country || "");
      setCity(data.city || "");
      setRepresentativeName(data.representative_name || "");
      setRegistrationNumber(data.registration_number || "");
      setWebsite(data.website || "");

      const { data: docs } = await supabase
        .from("verification_documents")
        .select("*")
        .eq("application_id", data.id);

      setDocuments(isArrayOf(docs, isVerificationDocument) ? docs : []);
    }
  }

  async function uploadDocument(documentType: VerificationDocument["document_type"], file: File) {
    if (!application) {
      alert("Please save your application details first.");
      return;
    }

    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      alert("Please upload a PDF, JPG, or PNG file.");
      return;
    }

    if (file.size > MAX_DOC_SIZE_BYTES) {
      alert("File is too large. Maximum size is 10MB.");
      return;
    }

    setUploadingDoc(documentType);

    const filePath = `${userId}/${documentType}-${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("verification-documents")
      .upload(filePath, file);

    if (uploadError) {
      setUploadingDoc(null);
      alert(uploadError.message);
      return;
    }

    const { data: docRow, error: docError } = await supabase
      .from("verification_documents")
      .insert({
        application_id: application.id,
        document_type: documentType,
        file_name: file.name,
        storage_path: filePath,
      })
      .select("*")
      .single();

    setUploadingDoc(null);

    if (!docError && isVerificationDocument(docRow)) {
      setDocuments((prev) => [...prev, docRow]);
    }
  }

  async function submitApplication() {
    if (!userId) return;

    if (!orgName.trim() || !country.trim() || !city.trim() || !representativeName.trim()) {
      alert("Please fill in Organization Name, Country, City, and Official Representative Name.");
      return;
    }

    setSaving(true);

    if (!application) {
      // First-time submission
      const { data, error } = await supabase
        .from("account_verifications")
        .insert({
          user_id: userId,
          account_type: accountType,
          organization_name: orgName.trim(),
          display_name: orgName.trim(),
          country: country.trim(),
          city: city.trim(),
          representative_name: representativeName.trim(),
          registration_number: registrationNumber.trim() || null,
          website: website.trim() || null,
          status: "pending",
        })
        .select("*")
        .single();

      setSaving(false);

      if (error || !isAccountVerification(data)) {
        alert(error?.message || "Failed to submit application.");
        return;
      }

      setApplication(data);
      alert("Your verification application has been submitted!");
      return;
    }

    if (status !== "rejected") {
      setSaving(false);
      alert("Your application can only be edited while it is Rejected.");
      return;
    }

    // Resubmission after rejection
    const { data, error } = await supabase
      .from("account_verifications")
      .update({
        organization_name: orgName.trim(),
        display_name: orgName.trim(),
        country: country.trim(),
        city: city.trim(),
        representative_name: representativeName.trim(),
        registration_number: registrationNumber.trim() || null,
        website: website.trim() || null,
        status: "pending",
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", application.id)
      .select("*")
      .single();

    setSaving(false);

    if (error || !isAccountVerification(data)) {
      alert(error?.message || "Failed to resubmit application.");
      return;
    }

    setApplication(data);
    alert("Your application has been resubmitted for review!");
  }

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  const status = application?.status ?? null;
  const canEdit = !application || status === "rejected";

  const statusConfig: Record<string, { icon: string; label: string; message: string; color: string }> = {
    none: {
      icon: "🔴",
      label: "Not Verified",
      message: "Submit your organization's details below to apply for ScoutAfrica verification.",
      color: "bg-red-50 text-red-700 border-red-200",
    },
    pending: {
      icon: "🟡",
      label: "Pending Review",
      message: "Your application is under review by the ScoutAfrica team. You'll be notified once a decision is made.",
      color: "bg-amber-50 text-amber-800 border-amber-200",
    },
    verified: {
      icon: "🟢",
      label: "Verified",
      message: "Your organization is verified by ScoutAfrica. This verification is permanent unless revoked by an administrator.",
      color: "bg-green-50 text-green-800 border-green-200",
    },
    rejected: {
      icon: "⚫",
      label: "Rejected",
      message: application?.rejection_reason
        ? `Your application was rejected: ${application.rejection_reason}. Please update your details and resubmit.`
        : "Your application was rejected. Please update your details and resubmit.",
      color: "bg-gray-100 text-gray-700 border-gray-300",
    },
  };

  const currentStatus = statusConfig[status || "none"];

  return (
    <main className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-6">Verification</h1>

        <div className={`border rounded-2xl p-5 mb-8 ${currentStatus.color}`}>
          <p className="font-bold text-lg">
            {currentStatus.icon} {currentStatus.label}
          </p>
          <p className="text-sm mt-1">{currentStatus.message}</p>
        </div>

        {status === "pending" && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-gray-500 text-sm">
            Your application details are locked while under review.
          </div>
        )}

        {status === "verified" && (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-sm text-gray-600 space-y-1">
            <p><span className="text-gray-400">Organization:</span> {application?.organization_name}</p>
            <p><span className="text-gray-400">Verified on:</span> {application?.verified_at ? new Date(application.verified_at).toLocaleDateString() : "—"}</p>
          </div>
        )}

        {canEdit && (
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full border rounded-lg p-3" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organization Type</label>
              <input value={accountType} disabled className="w-full border rounded-lg p-3 bg-gray-50 text-gray-500 capitalize" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full border rounded-lg p-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full border rounded-lg p-3" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Official Representative Name</label>
              <input value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} className="w-full border rounded-lg p-3" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Registration Number <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className="w-full border rounded-lg p-3" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Official Website <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full border rounded-lg p-3" placeholder="https://..." />
            </div>

            <button
              onClick={submitApplication}
              disabled={saving}
              className="w-full bg-green-600 hover:bg-green-700 text-white p-4 rounded-xl font-bold disabled:opacity-50"
            >
              {saving ? "Submitting..." : application ? "Resubmit Application" : "Submit Application"}
            </button>

            {application && (
              <div className="border-t pt-5 mt-2">
                <h2 className="font-bold mb-3">Supporting Documents</h2>
                <div className="space-y-3">
                  {(Object.keys(DOCUMENT_LABELS) as VerificationDocument["document_type"][]).map((docType) => {
                    const existing = documents.filter((d) => d.document_type === docType);
                    return (
                      <div key={docType}>
                        <p className="text-sm font-medium text-gray-700 mb-1">{DOCUMENT_LABELS[docType]}</p>
                        {existing.map((doc) => (
                          <p key={doc.id} className="text-xs text-gray-500 mb-1">✓ {doc.file_name}</p>
                        ))}
                        <input
                          ref={fileInputRefs[docType]}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadDocument(docType, file);
                          }}
                        />
                        <button
                          onClick={() => fileInputRefs[docType].current?.click()}
                          disabled={uploadingDoc === docType}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-2 rounded-lg disabled:opacity-50"
                        >
                          {uploadingDoc === docType ? "Uploading..." : "Upload File"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
