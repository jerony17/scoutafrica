import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// Service-role client only, per explicit instruction not to duplicate
// configuration - this is the same supabaseAdmin used by every other
// server-side write in this project (server-only guard, not exposed to
// the client). Writes MUST go through this route: support_tickets has
// no client-facing INSERT policy at all (confirmed directly against the
// live database before writing this file), so this route is not a
// convenience wrapper, it's the only path that can create a ticket.

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches the storage bucket's own limit

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const reason = String(formData.get("reason") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const attachment = formData.get("attachment");

    if (!fullName || !email || !reason || !subject || !message) {
      return NextResponse.json(
        { success: false, error: "fullName, email, reason, subject, and message are all required." },
        { status: 400 }
      );
    }

    // === Attachment upload (optional) ===
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (attachment instanceof File && attachment.size > 0) {
      if (!ALLOWED_MIME_TYPES.includes(attachment.type)) {
        return NextResponse.json(
          { success: false, error: "Attachments must be a PNG, JPG, or PDF file." },
          { status: 400 }
        );
      }
      if (attachment.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { success: false, error: "Attachment must be under 10MB." },
          { status: 400 }
        );
      }

      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `support-tickets/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("support-attachments")
        .upload(path, attachment, { contentType: attachment.type });

      if (uploadError) {
        console.error("Support ticket attachment upload failed:", uploadError);
        return NextResponse.json(
          { success: false, error: "Failed to upload attachment. Please try again." },
          { status: 500 }
        );
      }

      // Store the storage PATH, not a signed URL - signed URLs expire,
      // and a fresh one should be generated on demand whenever the
      // attachment is actually displayed (e.g. by the Support Ticket
      // Management page), not baked in permanently at submission time.
      attachmentUrl = path;
      attachmentName = attachment.name;
    }

    // === Save the ticket - only the columns this route owns are set
    // explicitly; every other column (id, user_id, timestamps, priority/
    // status defaults, assigned_to, resolved_at, admin_notes) is left to
    // the database, per explicit instruction not to touch the schema ===
    const { error: insertError } = await supabaseAdmin.from("support_tickets").insert({
      full_name: fullName,
      email,
      reason,
      subject,
      message,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      status: "Open",
      priority: "Normal",
    });

    if (insertError) {
      console.error("Failed to save support ticket:", insertError);
      return NextResponse.json(
        { success: false, error: "Something went wrong saving your message. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support ticket submission error:", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}