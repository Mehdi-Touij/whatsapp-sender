// Status endpoint — real-time campaign progress + smart number stats
import { NextRequest, NextResponse } from "next/server";
import { query, getCampaigns } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId");

    // Get all numbers with full stats
    const numbersResult = await query(`
      SELECT instance, display_name, phone, status, warmup_status, warmup_day,
             msgs_sent_today, msgs_sent_total, replies_total, daily_limit, hourly_limit,
             last_message_at, created_at
      FROM numbers ORDER BY created_at ASC
    `);
    
    const numbers = numbersResult.rows.map((n: any) => {
      const effectiveLimit = n.warmup_status === 'warmup' 
        ? (n.warmup_day <= 1 ? 20 : n.warmup_day === 2 ? 60 : n.warmup_day === 3 ? 100 : 160)
        : (n.daily_limit || 160);
      
      return {
        instance: n.instance,
        displayName: n.display_name || n.instance,
        phone: n.phone || '',
        status: n.status,
        warmupStatus: n.warmup_status,
        warmupDay: n.warmup_day,
        warmupProgress: n.warmup_status === 'warmup' ? `${Math.min(n.warmup_day, 3)}/3` : '✓',
        msgsToday: n.msgs_sent_today || 0,
        msgsTotal: n.msgs_sent_total || 0,
        replies: n.replies_total || 0,
        replyRate: n.msgs_sent_total > 0 ? `${((n.replies_total / n.msgs_sent_total) * 100).toFixed(1)}%` : '0%',
        effectiveLimit,
        hourlyLimit: n.hourly_limit || 20,
        capacityLeft: effectiveLimit - (n.msgs_sent_today || 0),
        lastMessage: n.last_message_at,
      };
    });

    if (campaignId) {
      const campaignResult = await query("SELECT * FROM campaigns WHERE id = $1", [campaignId]);
      const campaign = campaignResult.rows[0];
      
      return NextResponse.json({
        campaign: campaign ? {
          ...campaign,
          replyRate: campaign.sent_count > 0 ? `${((campaign.reply_count / campaign.sent_count) * 100).toFixed(1)}%` : '0%',
          progress: campaign.total_recipients > 0 ? `${((campaign.sent_count / campaign.total_recipients) * 100).toFixed(1)}%` : '0%',
        } : null,
        numbers,
        totalCapacity: numbers.reduce((sum: number, n: any) => sum + n.capacityLeft, 0),
      });
    }

    const campaigns = await getCampaigns();
    
    return NextResponse.json({
      campaigns: campaigns.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        total: c.total_recipients || 0,
        sent: c.sent_count || 0,
        replies: c.reply_count || 0,
      })),
      numbers,
      totalCapacity: numbers.reduce((sum: number, n: any) => sum + n.capacityLeft, 0),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}