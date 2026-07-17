// Campaign control — start/stop campaign
import { NextRequest, NextResponse } from "next/server";
import { query, getPendingRecipients, updateCampaignStats } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { campaignId, action } = await req.json();

    if (action === "start") {
      const recipients = await getPendingRecipients(campaignId);
      await query("UPDATE campaigns SET status = $1, started_at = NOW() WHERE id = $2", ["sending", campaignId]);
      
      // Trigger the VPS sender via a webhook call
      const senderUrl = process.env.SENDER_WEBHOOK_URL;
      if (senderUrl) {
        await fetch(senderUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
      }

      return NextResponse.json({ ok: true, count: recipients.length });
    }

    if (action === "stop") {
      await query("UPDATE campaigns SET status = $1 WHERE id = $2", ["paused", campaignId]);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}