// Webhook handler — receives incoming messages and connection updates from Evolution API
// POST /api/webhook — called by Evolution API when events happen

import { NextRequest, NextResponse } from "next/server";
import { query, markReplied, markNumberRestricted } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const event = body.event;
  const instance = body.instance;

  if (event === "MESSAGES_UPSERT") {
    // Incoming message (reply from subscriber)
    const messageData = body.data;
    if (!messageData?.key?.fromMe) {
      // This is an incoming reply (not from us)
      const phone = messageData?.key?.remoteJid?.replace("@s.whatsapp.net", "");
      const text = messageData?.message?.conversation || "";

      if (phone) {
        if (text.toUpperCase().includes("STOP")) {
          // Opt-out
          await query("UPDATE recipients SET status = $1 WHERE phone = $2", ["stopped", phone]);
        } else if (text.includes("1")) {
          // Confirmed receipt
          await markReplied(phone);
        } else {
          // Any reply counts as engagement
          await markReplied(phone);
        }
      }
    }
  } else if (event === "CONNECTION_UPDATE") {
    // Number status changed
    const status = body.data?.state;
    if (status === "close") {
      // Number got restricted/banned — remove from rotation
      await markNumberRestricted(instance);
      console.error(`[webhook] Number ${instance} restricted/banned!`);
    }
  }

  return NextResponse.json({ ok: true });
}