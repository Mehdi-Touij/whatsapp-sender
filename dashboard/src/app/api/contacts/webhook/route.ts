// Webhook receiver for external tools (Clay, Zapier, n8n, custom scripts, etc.)
// Accepts a single contact: { phone, name, source, notes }
// Returns { ok: true, id } so external systems can confirm receipt.
import { NextRequest, NextResponse } from "next/server";
import { addContact } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = (body?.phone || "").toString().trim();
    if (!phone) {
      return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
    }
    const name = body?.name ? body.name.toString().trim() : null;
    const source = body?.source ? body.source.toString().trim() : "webhook";
    const notes = body?.notes ? body.notes.toString().trim() : null;

    const contact = await addContact({ phone, name, source, notes });
    return NextResponse.json({ ok: true, id: contact.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Cheap health check so external tools can verify the endpoint exists.
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "contacts/webhook" });
}