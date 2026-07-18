// CSV upload endpoint — accepts CSV with phone numbers and names
// Fixed: recipients are per-campaign, not global
// Added: checks global opt-out list
import { NextRequest, NextResponse } from "next/server";
import { query, createCampaign, addRecipient } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaignName = formData.get("campaignName") as string;
    const messageTemplate = formData.get("messageTemplate") as string;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (!campaignName) return NextResponse.json({ error: "Campaign name required" }, { status: 400 });
    if (!messageTemplate) return NextResponse.json({ error: "Message template required" }, { status: 400 });

    const text = await file.text();
    const lines = text.trim().split("\n").filter((l) => l.trim());

    const recipients: { phone: string; name: string }[] = [];
    for (const line of lines) {
      if (line.toLowerCase().includes("phone") && line.toLowerCase().includes("name")) continue;
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 1 && parts[0]) {
        recipients.push({
          phone: parts[0].replace(/\s/g, "").replace("+", ""),
          name: parts[1] || "",
        });
      }
    }

    const campaignId = randomUUID();
    await createCampaign(campaignId, campaignName, messageTemplate);

    let added = 0;
    let skippedOptOut = 0;

    for (const r of recipients) {
      // Check if this phone is in the global opt-out list
      const optOutResult = await query(
        "SELECT 1 FROM opt_out_list WHERE phone = $1",
        [r.phone]
      );
      if (optOutResult.rows.length > 0) {
        skippedOptOut++;
        continue;
      }

      await addRecipient(r.phone, r.name, campaignId);
      added++;
    }

    return NextResponse.json({
      campaignId,
      count: added,
      skippedOptOut,
      total: recipients.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}