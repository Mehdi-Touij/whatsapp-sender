// Bulk add contacts — accepts { contacts: [{ phone, name, source?, notes? }], source? }
// Returns { ok, inserted, skipped }.
import { NextRequest, NextResponse } from "next/server";
import { addContactsBulk } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.contacts) ? body.contacts : null;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "contacts array required" }, { status: 400 });
    }
    const defaultSource = body?.source ? body.source.toString().trim() : null;
    const result = await addContactsBulk(items, defaultSource);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}