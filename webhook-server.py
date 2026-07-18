#!/usr/bin/env python3
"""
Webhook receiver V2 — receives replies from Evolution API, updates database.
Features:
- Reply tracking (mark recipient as replied)
- Global opt-out list (STOP replies → added to opt_out_list)
- Ban detection (connection close → mark number as restricted)
- Telegram alert on ban
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import psycopg2
import sys
import requests
import subprocess

DATABASE_URL = os.environ.get("DATABASE_URL", "")
TELEGRAM_BOT_TOKEN = ""
TELEGRAM_CHAT_ID = ""

# Read Telegram bot token from .env
with open("/opt/data/.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("TELEGRAM_BOT_TOKEN"):
            TELEGRAM_BOT_TOKEN = line.split("=", 1)[1]
        elif line.startswith("TELEGRAM_CHAT_ID"):
            TELEGRAM_CHAT_ID = line.split("=", 1)[1]

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def send_telegram_alert(message):
    """Send alert to user via Telegram"""
    try:
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"},
                timeout=10
            )
    except:
        pass

def process_reply(phone, text):
    """Update recipient status based on reply"""
    conn = get_db()
    cur = conn.cursor()
    text_upper = text.upper().strip()
    
    if text_upper in ("STOP", "UNSUBSCRIBE", "STOP ALL", "UNSUB", "ARRÊT", "STOPALL"):
        # Add to global opt-out list
        cur.execute(
            "INSERT INTO opt_out_list (phone, reason) VALUES (%s, %s) ON CONFLICT (phone) DO NOTHING",
            [phone, text]
        )
        # Mark all recipients with this phone as stopped
        cur.execute("UPDATE recipients SET status = 'stopped', opt_out = true WHERE phone = %s", [phone])
        print(f"🚫 Opt-out: {phone}")
        send_telegram_alert(f"🚫 *Opt-out*: {phone} replied STOP and was removed from all campaigns")
    else:
        # Mark as replied — but ONLY in campaigns where this phone was sent (not all campaigns)
        # The webhook doesn't know which campaign, so we mark the most recent 'sent' as replied
        cur.execute(
            "UPDATE recipients SET status = 'replied', replied_at = NOW() WHERE phone = %s AND status = 'sent' AND sent_at = (SELECT MAX(sent_at) FROM recipients WHERE phone = %s AND status = 'sent')",
            [phone, phone]
        )
        print(f"✅ Reply from {phone}: {text[:50]}")
    conn.commit()
    conn.close()

def mark_number_banned(instance):
    """Mark number as restricted and send Telegram alert"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE numbers SET status = 'restricted', restricted_at = NOW() WHERE instance = %s", [instance])
    conn.commit()
    conn.close()
    print(f"🚫 Number {instance} BANNED")
    send_telegram_alert(f"🚫 *ALERT*: Number `{instance}` has been banned! It was removed from rotation. Please add a replacement number.")

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            event = data.get("event", "")
            instance = data.get("instance", "")
            
            if event == "MESSAGES_UPSERT":
                msg_data = data.get("data", {})
                if not msg_data.get("key", {}).get("fromMe", False):
                    phone = msg_data.get("key", {}).get("remoteJid", "").replace("@s.whatsapp.net", "").replace("@lid", "")
                    text = msg_data.get("message", {}).get("conversation", "") or msg_data.get("message", {}).get("extendedTextMessage", {}).get("text", "")
                    if phone and text:
                        process_reply(phone, text)
            
            elif event == "CONNECTION_UPDATE":
                state = data.get("data", {}).get("state", "")
                if state == "close" and instance:
                    mark_number_banned(instance)
        except Exception as e:
            print(f"Error: {e}")
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    
    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "8090"))
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Webhook server V2 running on port {port}...")
    server.serve_forever()