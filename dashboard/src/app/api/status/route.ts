// Status endpoint — real-time campaign progress
// GET /api/status?campaignId=xxx

import { NextRequest, NextResponse } from "next/server";
import { query, getCampaignProgress, getActiveNumbers } from "@/lib/db";

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaignId");

  if (campaignId) {
    const campaign = await getCampaignProgress(campaignId);
    const numbers = await getActiveNumbers();
    const replyRate = campaign?.sent_count > 0
      ? ((campaign.reply_count / campaign.sent_count) * 100).toFixed(1)
      : "0";

    return NextResponse.json({
      campaign: campaign ? {
        ...campaign,
        replyRate: `${replyRate}%`,
        progress: campaign.total_recipients > 0
          ? `${((campaign.sent_count / campaign.total_recipients) * 100).toFixed(1)}%`
          : "0%",
      } : null,
      numbers: numbers.map((n: any) => ({
        instance: n.instance,
        status: n.status,
        messagesToday: n.messages_sent_today,
        repliesToday: n.replies_received_today,
      })),
    });
  }

  // No campaignId — return all campaigns
  const campaigns = await query("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 20");
  const numbers = await getActiveNumbers();

  return NextResponse.json({
    campaigns: campaigns.rows,
    numbers: numbers.map((n: any) => ({
      instance: n.instance,
      status: n.status,
      messagesToday: n.messages_sent_today,
    })),
  });
}