// Campaign control — start/stop campaign
// POST /api/campaign — start campaign by triggering Trigger.dev task

import { NextRequest, NextResponse } from "next/server";
import { query, getPendingRecipients, updateCampaignStats } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { campaignId, action } = await req.json();

  if (action === "start") {
    // Get recipients
    const recipients = await getPendingRecipients(campaignId);

    // Update campaign status
    await query("UPDATE campaigns SET status = $1, started_at = NOW() WHERE id = $2", ["sending", campaignId]);

    // Trigger the sending (call Trigger.dev API or run inline)
    // For now, we'll trigger via an internal endpoint
    const triggerUrl = process.env.TRIGGER_URL;
    if (triggerUrl) {
      await fetch(`${triggerUrl}/api/v1/tasks/send-broadcast/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: *** },
        body: JSON.stringify({
          recipients,
          messageTemplate: (await query("SELECT message_template FROM campaigns WHERE id = $1", [campaignId])).rows[0]?.message_template,
          campaignId,
        }),
      });
    } else {
      // Fallback: send directly from this endpoint (for testing)
      // In production, use Trigger.dev
    }

    return NextResponse.json({ ok: true, count: recipients.length });
  }

  if (action === "stop") {
    await query("UPDATE campaigns SET status = $1 WHERE id = $2", ["paused", campaignId]);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}