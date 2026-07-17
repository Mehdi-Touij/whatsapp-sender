// API route — Add a new WhatsApp number (generate QR code)
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { displayName, instanceName } = await req.json();
    
    if (!displayName || !instanceName) {
      return NextResponse.json({ error: "Display name and instance name required" }, { status: 400 });
    }

    // Create instance in Evolution API
    const evoUrl = process.env.EVOLUTION_URL || "http://localhost:8082";
    const evoKey = process.env.EVOLUTION_API_KEY || "";
    
    const createRes = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: { "apikey": evoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return NextResponse.json({ error: `Evolution API: ${err}` }, { status: 400 });
    }

    const data = await createRes.json();
    
    let code = "";
    if (data.qrcode && typeof data.qrcode === "object") {
      code = data.qrcode.code || "";
    }
    if (!code && data.code) code = data.code;

    // Insert into database
    await query(
      "INSERT INTO numbers (instance, display_name, status, warmup_status, warmup_day, daily_limit, hourly_limit) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [instanceName, displayName, "connecting", "warmup", 1, 160, 20]
    );

    return NextResponse.json({ 
      ok: true, 
      instance: instanceName, 
      qrCode: code,
      displayName,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Delete a number
export async function DELETE(req: NextRequest) {
  try {
    const { instance } = await req.json();
    
    // Delete from Evolution API
    const evoUrl = process.env.EVOLUTION_URL || "http://localhost:8082";
    const evoKey = process.env.EVOLUTION_API_KEY || "";
    
    await fetch(`${evoUrl}/instance/delete/${instance}`, {
      method: "DELETE",
      headers: { "apikey": evoKey },
    });

    // Delete from database
    await query("DELETE FROM numbers WHERE instance = $1", [instance]);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}