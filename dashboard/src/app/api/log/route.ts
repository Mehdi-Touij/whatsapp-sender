// Log endpoint — receives send logs from Trigger.dev task
// POST /api/log

import { NextRequest, NextResponse } from "next/server";
import { query, logSend, markSent, updateCampaignStats } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { campaignId, phone, numberUsed, messageText, status } = await req.json();

  // Log the send
  await logSend(campaignId, phone, numberUsed, messageText, status);

  // Mark recipient as sent
  if (status === "sent") {
    await markSent(phone, numberUsed);
  }

  // Update campaign stats
  await updateCampaignStats(campaignId);

  return NextResponse.json({ ok: true });
}