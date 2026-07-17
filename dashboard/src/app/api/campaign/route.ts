// Campaign control — start/stop campaign
// Calls the VPS trigger server to run the smart sender
import { NextRequest, NextResponse } from "next/server";
import { query, getPendingRecipients } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { campaignId, action } = await req.json();

    if (action === "start") {
      const recipients = await getPendingRecipients(campaignId);
      await query("UPDATE campaigns SET status = $1, started_at = NOW() WHERE id = $2", ["sending", campaignId]);

      // Call the VPS trigger server
      const triggerUrl = process.env.TRIGGER_URL || "http://localhost:8091/start-campaign";
      try {
        await fetch(triggerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
      } catch (e) {
        // Trigger server might not be reachable from Railway — that's OK
        // The campaign can still be started manually from the VPS
        console.log("Trigger server not reachable, campaign can be started from VPS");
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