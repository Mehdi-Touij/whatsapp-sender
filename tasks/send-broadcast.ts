// Trigger.dev task — main broadcast sender with anti-ban logic
// Deploy this as a Trigger.dev task

import { task } from "@trigger.dev/sdk/v4";
import { randomInt } from "crypto";

const EVOLUTION_URL = process.env.EVOLUTION_URL || "http://localhost:8080";
const API_KEY=proces...EY || "";

// 7 WhatsApp numbers (Evolution API instance names)
const NUMBERS = [
  "course-number-1", "course-number-2", "course-number-3",
  "course-number-4", "course-number-5", "course-number-6",
  "course-number-7",
];

// In-memory rate limiting (per number: max 20 msgs/hour)
const numberUsage = new Map<string, number[]>();

function canSendFromNumber(number: string): boolean {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recent = (numberUsage.get(number) || []).filter((t) => t > oneHourAgo);
  numberUsage.set(number, recent);
  return recent.length < 20;
}

function getNextNumber(): string | null {
  for (const n of NUMBERS) {
    if (canSendFromNumber(n)) return n;
  }
  return null;
}

// Spintax: {Hi|Hello|Hey} → random choice
function parseSpintax(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_, opts: string) => {
    const choices = opts.split("|");
    return choices[randomInt(0, choices.length - 1)];
  });
}

// Random delay 30-90 seconds (NEVER fixed)
function randomDelay(): Promise<void> {
  const seconds = randomInt(30, 90);
  console.log(`  Waiting ${seconds}s...`);
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Send via Evolution API
async function send(instance: string, phone: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_URL}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: API_KEY, },
      body: JSON.stringify({ number: phone, textMessage: { text } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Main task
export const sendBroadcast = task({
  id: "send-broadcast",
  maxDuration: 7200, // 2 hours max
  run: async (payload: {
    recipients: { phone: string; name?: string }[];
    messageTemplate: string;
    campaignId: string;
  }) => {
    const { recipients, messageTemplate, campaignId } = payload;
    const results = { sent: 0, failed: 0, skipped: 0 };
    const dbUrl = process.env.DATABASE_URL;

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];

      // Get next available number
      let number = getNextNumber();
      if (!number) {
        console.log(`[${i + 1}/${recipients.length}] All numbers at capacity, waiting 60s...`);
        await new Promise((resolve) => setTimeout(resolve, 60000));
        number = getNextNumber();
      }
      if (!number) {
        results.skipped++;
        continue;
      }

      // Build message: spintax + personalize + reply prompt
      const personalized = messageTemplate
        .replace(/{name}/g, r.name || "")
        .replace(/{phone}/g, r.phone);
      const spintaxed = parseSpintax(personalized);
      const message = `${spintaxed}\n\nReply 1 to confirm you received this.`;

      // Send
      const success = await send(number, r.phone, message);

      if (success) {
        results.sent++;
        const ts = numberUsage.get(number) || [];
        ts.push(Date.now());
        numberUsage.set(number, ts);

        // Log to database
        if (dbUrl) {
          try {
            await fetch(`${process.env.DASHBOARD_URL}/api/log`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                campaignId, phone: r.phone, numberUsed: number,
                messageText: message, status: "sent",
              }),
            });
          } catch {}
        }
      } else {
        results.failed++;
      }

      // Progress every 50 messages
      if ((i + 1) % 50 === 0) {
        console.log(`[${i + 1}/${recipients.length}] Sent: ${results.sent}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
      }

      // Random delay (30-90 seconds)
      await randomDelay();
    }

    console.log(`\nCampaign ${campaignId} complete:`, results);
    return results;
  },
});