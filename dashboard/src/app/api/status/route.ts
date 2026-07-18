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

    // Recent replies (last 10) — used by overview/monitor live feed
    let recentReplies: any[] = [];
    try {
      const repliesResult = await query(`
        SELECT r.phone, r.name, r.campaign_id, r.replied_at, c.name AS campaign_name
        FROM recipients r
        LEFT JOIN campaigns c ON c.id = r.campaign_id
        WHERE r.status = 'replied' AND r.replied_at IS NOT NULL
        ORDER BY r.replied_at DESC
        LIMIT 10
      `);
      recentReplies = repliesResult.rows.map((row: any) => ({
        phone: row.phone,
        name: row.name || "",
        campaignName: row.campaign_name || "",
        receivedAt: row.replied_at,
      }));
    } catch {}

    // Build per-number current-hour send counts (used by the numbers grid)
    try {
      const hourResult = await query(`
        SELECT number_used, COUNT(*)::int AS cnt
        FROM send_log
        WHERE created_at >= date_trunc('hour', NOW())
        GROUP BY number_used
      `);
      const hourMap: Record<string, number> = {};
      for (const row of hourResult.rows) hourMap[row.number_used] = row.cnt;
      for (const n of numbers) (n as any).msgsThisHour = hourMap[(n as any).instance] || 0;
    } catch {}

    if (campaignId) {
      const campaignResult = await query("SELECT * FROM campaigns WHERE id = $1", [campaignId]);
      const campaign = campaignResult.rows[0];

      // Per-number breakdown for this campaign (sent counts)
      let perNumber: any[] = [];
      try {
        const pnResult = await query(`
          SELECT number_used AS instance, COUNT(*)::int AS sent,
                 SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END)::int AS replies,
                 SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
          FROM recipients
          WHERE campaign_id = $1 AND number_used IS NOT NULL
          GROUP BY number_used
        `, [campaignId]);
        perNumber = pnResult.rows;
      } catch {}

      // Live reply feed for this campaign (last 25)
      let liveReplies: any[] = [];
      try {
        const lrResult = await query(`
          SELECT phone, name, replied_at AS receivedAt
          FROM recipients
          WHERE campaign_id = $1 AND status = 'replied' AND replied_at IS NOT NULL
          ORDER BY replied_at DESC LIMIT 25
        `, [campaignId]);
        liveReplies = lrResult.rows;
      } catch {}

      return NextResponse.json({
        campaign: campaign ? {
          ...campaign,
          replyRate: campaign.sent_count > 0 ? `${((campaign.reply_count / campaign.sent_count) * 100).toFixed(1)}%` : '0%',
          progress: campaign.total_recipients > 0 ? `${((campaign.sent_count / campaign.total_recipients) * 100).toFixed(1)}%` : '0%',
          perNumber,
          liveReplies,
        } : null,
        numbers,
        totalCapacity: numbers.reduce((sum: number, n: any) => sum + n.capacityLeft, 0),
        recentReplies,
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
        started_at: c.started_at || null,
        message_template: c.message_template || "",
      })),
      numbers,
      totalCapacity: numbers.reduce((sum: number, n: any) => sum + n.capacityLeft, 0),
      recentReplies,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}