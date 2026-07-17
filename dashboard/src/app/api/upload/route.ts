// CSV upload endpoint — accepts CSV with phone numbers and names
import { NextRequest, NextResponse } from "next/server";
import { createCampaign, addRecipient } from "@/lib/db";
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

    for (const r of recipients) {
      await addRecipient(r.phone, r.name, campaignId);
    }

    return NextResponse.json({ campaignId, count: recipients.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}