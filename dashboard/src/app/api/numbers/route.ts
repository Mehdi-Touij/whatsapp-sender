// API route — Add a new WhatsApp number via database bridge
// Dashboard writes a QR request to the database
// VPS trigger server picks it up, generates QR, writes it back
// Dashboard polls for the result
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { displayName, instanceName } = await req.json();
    
    if (!displayName || !instanceName) {
      return NextResponse.json({ error: "Display name and instance name required" }, { status: 400 });
    }

    // Write QR request to database
    await query(
      "INSERT INTO qr_requests (id, display_name, instance_name, status) VALUES ($1, $2, $3, $4)",
      [instanceName, displayName, instanceName, "pending"]
    );

    return NextResponse.json({ 
      ok: true, 
      instance: instanceName,
      displayName,
      message: "QR request created. Polling for QR code...",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — poll for QR code result
export async function GET(req: NextRequest) {
  try {
    const instance = req.nextUrl.searchParams.get("instance");
    if (!instance) {
      return NextResponse.json({ error: "Instance required" }, { status: 400 });
    }

    const result = await query("SELECT * FROM qr_requests WHERE id = $1", [instance]);
    const row = result.rows[0];
    
    if (!row) {
      return NextResponse.json({ status: "not_found" });
    }

    return NextResponse.json({
      status: row.status,
      qrCode: row.qr_code || "",
      displayName: row.display_name,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Delete a number — creates a delete request that the VPS trigger server will process
export async function DELETE(req: NextRequest) {
  try {
    const { instance } = await req.json();
    
    // Delete from database immediately
    await query("DELETE FROM numbers WHERE instance = $1", [instance]);
    await query("DELETE FROM qr_requests WHERE id = $1", [instance]);
    
    // Also add a delete request for the VPS to process (delete from Evolution API)
    await query(
      "INSERT INTO qr_requests (id, display_name, instance_name, status) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET status = $4",
      [instance + "-delete", "DELETE", instance, "delete-request"]
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}