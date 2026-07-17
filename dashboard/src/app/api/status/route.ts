// Status endpoint — real-time campaign progress + number status
import { NextRequest, NextResponse } from "next/server";
import { getCampaignProgress, getActiveNumbers, getCampaigns } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
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

    const campaigns = await getCampaigns();
    const numbers = await getActiveNumbers();

    return NextResponse.json({
      campaigns: campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        total: c.total_recipients,
        sent: c.sent_count,
        replies: c.reply_count,
      })),
      numbers: numbers.map((n: any) => ({
        instance: n.instance,
        status: n.status,
        messagesToday: n.messages_sent_today,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}