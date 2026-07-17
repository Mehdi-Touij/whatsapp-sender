// Webhook handler — receives replies from Evolution API
import { NextRequest, NextResponse } from "next/server";
import { markReplied, markNumberRestricted } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event;
    const instance = body.instance;

    if (event === "MESSAGES_UPSERT") {
      const messageData = body.data;
      if (!messageData?.key?.fromMe) {
        const phone = messageData?.key?.remoteJid?.replace("@s.whatsapp.net", "");
        const text = messageData?.message?.conversation || "";

        if (phone) {
          if (text.toUpperCase().includes("STOP")) {
            await markReplied(phone);
          } else if (text.includes("1")) {
            await markReplied(phone);
          } else {
            await markReplied(phone);
          }
        }
      }
    } else if (event === "CONNECTION_UPDATE") {
      const status = body.data?.state;
      if (status === "close" && instance) {
        await markNumberRestricted(instance);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}