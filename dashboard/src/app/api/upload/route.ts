// CSV upload endpoint — accepts CSV with phone numbers and names
// POST /api/upload

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const campaignName = formData.get("campaignName") as string;
  const messageTemplate = formData.get("messageTemplate") as string;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const text = await file.text();
  const lines = text.trim().split("\n").filter((l) => l.trim());

  // Parse CSV (skip header if it contains "phone")
  const recipients: { phone: string; name: string }[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes("phone") && line.toLowerCase().includes("name")) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length >= 1) {
      recipients.push({
        phone: parts[0].replace(/\s/g, ""),
        name: parts[1] || "",
      });
    }
  }

  // Create campaign
  const campaignId = randomUUID();
  await query(
    "INSERT INTO campaigns (id, name, message_template, total_recipients, status) VALUES ($1, $2, $3, $4, $5)",
    [campaignId, campaignName, messageTemplate, recipients.length, "draft"]
  );

  // Insert recipients
  for (const r of recipients) {
    await query(
      "INSERT INTO recipients (phone, name, status, campaign_id) VALUES ($1, $2, $3, $4) ON CONFLICT (phone) DO UPDATE SET campaign_id = $4",
      [r.phone, r.name, "pending", campaignId]
    );
  }

  return NextResponse.json({ campaignId, count: recipients.length });
}