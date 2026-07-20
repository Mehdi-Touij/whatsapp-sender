// Campaign control — start/stop campaign via database bridge
// Dashboard writes a trigger to the database, VPS trigger server picks it up
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { campaignId, action } = await req.json();
    
    if (!campaignId || !action) {
      return NextResponse.json({ error: "campaignId and action required" }, { status: 400 });
    }

    // Update campaign status
    if (action === "start") {
      await query("UPDATE campaigns SET status = 'sending', started_at = NOW() WHERE id = $1", [campaignId]);
    } else if (action === "stop") {
      await query("UPDATE campaigns SET status = 'paused' WHERE id = $1", [campaignId]);
    }

    // Write trigger to database for VPS to pick up
    await query(
      "INSERT INTO campaign_triggers (id, campaign_id, action, status) VALUES ($1, $2, $3, 'pending') ON CONFLICT (id) DO UPDATE SET action = $3, status = 'pending', created_at = NOW(), processed_at = NULL",
      [campaignId + "-" + action + "-" + Date.now(), campaignId, action]
    );

    return NextResponse.json({ ok: true, campaignId, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}