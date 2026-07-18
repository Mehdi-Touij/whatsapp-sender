// Non-responders API — get non-responders + create follow-up campaigns
import { NextRequest, NextResponse } from "next/server";
import { query, getNonResponders, createFollowupCampaign } from "@/lib/db";

// GET — list non-responders for a campaign
export async function GET(req: NextRequest) {
  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId");
    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    
    const nonResponders = await getNonResponders(campaignId);
    return NextResponse.json({ count: nonResponders.length, recipients: nonResponders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — create follow-up campaign from non-responders
export async function POST(req: NextRequest) {
  try {
    const { originalCampaignId, followupName, messageTemplate } = await req.json();
    
    if (!originalCampaignId || !followupName || !messageTemplate) {
      return NextResponse.json({ error: "originalCampaignId, followupName, messageTemplate required" }, { status: 400 });
    }
    
    const result = await createFollowupCampaign(originalCampaignId, followupName, messageTemplate);
    return NextResponse.json({ ok: true, campaignId: result.id, count: result.count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}