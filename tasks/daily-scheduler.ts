// Daily scheduler — Trigger.dev cron task
// Runs at 9 AM Morocco time, picks up today's campaign and sends

import { task } from "@trigger.dev/sdk/v4";

export const dailyBroadcast = task({
  id: "daily-broadcast-scheduler",
  schedule: {
    cron: "0 9 * * *", // 9 AM UTC+1 (Morocco)
  },
  run: async () => {
    // 1. Fetch today's campaign from database
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set");

    // 2. Get active campaign
    const res = await fetch(`${process.env.DASHBOARD_URL}/api/status`);
    const data = await res.json();

    // 3. If there's a campaign in "draft" or "paused" status, trigger send
    // This is a simple version — in production you'd have more logic
    console.log("Daily scheduler ran — checking for campaigns to send");
  },
});