// Contacts API — global address book for the dashboard.
// Endpoints:
//   GET    /api/contacts?search=X&status=Y&limit=50&offset=0  → list (paginated/filtered)
//   POST   /api/contacts      { phone, name, source, notes }    → add single contact
//   DELETE /api/contacts?phone=X                                → delete by phone
import { NextRequest, NextResponse } from "next/server";
import {
  listContacts,
  addContact,
  deleteContactByPhone,
} from "@/lib/db";

// GET — paginated + filtered list
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") || undefined;
    const status = sp.get("status") || undefined;
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50;
    const offset = sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0;

    const result = await listContacts({ search, status, limit, offset });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — add a single contact (also used internally by the dashboard form)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = (body?.phone || "").toString().trim();
    if (!phone) {
      return NextResponse.json({ error: "phone is required" }, { status: 400 });
    }
    const name = body?.name ? body.name.toString().trim() : null;
    const source = body?.source ? body.source.toString().trim() : null;
    const notes = body?.notes ? body.notes.toString().trim() : null;

    const contact = await addContact({ phone, name, source, notes });
    return NextResponse.json({ ok: true, id: contact.id, contact });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — remove by phone (?phone=X)
export async function DELETE(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone");
    if (!phone) {
      return NextResponse.json({ error: "phone query param required" }, { status: 400 });
    }
    const removed = await deleteContactByPhone(phone);
    return NextResponse.json({ ok: removed });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}