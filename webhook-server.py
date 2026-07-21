#!/usr/bin/env python3
"""
Webhook receiver V3 — receives replies from Evolution API, updates database.
Features:
- Opt-in flow: START message → auto-reply "subscribed" → mark opted in
- Reply tracking (mark recipient as replied)
- Global opt-out list (STOP replies → added to opt_out_list)
- Ban detection (connection close → mark number as restricted)
- Telegram alerts
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import psycopg2
import sys
import requests
import subprocess
import urllib.request

DATABASE_URL = os.environ.get("DATABASE_URL", "")
EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8082")
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "")
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

# Read Evolution API key
with open("/opt/data/evolution-api/.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("AUTHENTICATION_API_KEY"):
            EVOLUTION_API_KEY = line.split("=", 1)[1]

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def send_telegram_alert(message):
    try:
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"},
                timeout=10
            )
    except:
        pass

def send_whatsapp_reply(instance, phone, text):
    """Send a WhatsApp message via Evolution API"""
    try:
        data = json.dumps({"number": phone, "text": text}).encode()
        req = urllib.request.Request(
            f"{EVOLUTION_URL}/message/sendText/{instance}",
            headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
            data=data,
            method="POST"
        )
        urllib.request.urlopen(req, timeout=30)
        return True
    except Exception as e:
        print(f"  Send reply error: {e}")
        return False

def process_opt_in(phone, instance, text):
    """Handle opt-in: mark contact as opted in and auto-reply"""
    conn = get_db()
    cur = conn.cursor()
    
    # Check if already opted in
    cur.execute("SELECT phone FROM opt_in_log WHERE phone = %s", [phone])
    already_in = cur.fetchone()
    
    if not already_in:
        # Add to opt-in log
        cur.execute(
            "INSERT INTO opt_in_log (phone, instance, message_text) VALUES (%s, %s, %s) ON CONFLICT (phone) DO NOTHING",
            [phone, instance, text]
        )
        
        # Update contacts table
        cur.execute(
            "UPDATE contacts SET opt_in = true, opt_in_at = NOW() WHERE phone = %s",
            [phone]
        )
        
        # Update recipients table
        cur.execute(
            "UPDATE recipients SET opt_in = true WHERE phone = %s",
            [phone]
        )
        
        print(f"✅ Opt-in: {phone}")
        send_telegram_alert(f"✅ *New opt-in*: {phone} subscribed to receive messages")
        
        # Auto-reply
        reply_text = "You are subscribed! You will receive course updates and lessons. Reply STOP anytime to unsubscribe."
        send_whatsapp_reply(instance, phone, reply_text)
        print(f"  → Auto-reply sent to {phone}")
    else:
        # Already opted in — just reply
        reply_text = "You are already subscribed! Reply STOP to unsubscribe."
        send_whatsapp_reply(instance, phone, reply_text)
        print(f"  → Already opted in: {phone}")
    
    conn.commit()
    conn.close()

def process_reply(phone, text, instance):
    """Update recipient status based on reply"""
    conn = get_db()
    cur = conn.cursor()
    text_upper = text.upper().strip()
    
    # Check for opt-in keywords
    if text_upper in ("START", "SUBSCRIBE", "YES", "OUI", "1", "OK", "HI", "HELLO", "SALAM", "SAW", "BONJOUR"):
        conn.close()
        process_opt_in(phone, instance, text)
        return
    
    if text_upper in ("STOP", "UNSUBSCRIBE", "STOP ALL", "UNSUB", "ARRET", "STOPALL"):
        # Add to global opt-out list
        cur.execute(
            "INSERT INTO opt_out_list (phone, reason) VALUES (%s, %s) ON CONFLICT (phone) DO NOTHING",
            [phone, text]
        )
        # Mark all recipients with this phone as stopped
        cur.execute("UPDATE recipients SET status = 'stopped' WHERE phone = %s", [phone])
        # Remove from opt-in
        cur.execute("DELETE FROM opt_in_log WHERE phone = %s", [phone])
        cur.execute("UPDATE contacts SET opt_in = false WHERE phone = %s", [phone])
        print(f"🚫 Opt-out: {phone}")
        send_telegram_alert(f"🚫 *Opt-out*: {phone} unsubscribed")
        
        # Auto-reply
        send_whatsapp_reply(instance, phone, "You have been unsubscribed. Send START to subscribe again.")
    else:
        # Mark as replied
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
    send_telegram_alert(f"🚫 *ALERT*: Number `{instance}` has been banned!")

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
                    remote_jid = msg_data.get("key", {}).get("remoteJid", "")
                    phone = remote_jid.replace("@s.whatsapp.net", "").replace("@lid", "").split(":")[0]
                    text = msg_data.get("message", {}).get("conversation", "") or msg_data.get("message", {}).get("extendedTextMessage", {}).get("text", "")
                    if phone and text:
                        process_reply(phone, text, instance)
            
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
    # Set DATABASE_URL from cached file if not in env
    if not DATABASE_URL:
        with open("/opt/data/whatsapp-sender/.db_url") as f:
            DATABASE_URL = f.read().strip()
        os.environ["DATABASE_URL"] = DATABASE_URL
    
    port = int(os.environ.get("WEBHOOK_PORT", "8090"))
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Webhook server V3 (opt-in) running on port {port}...")
    server.serve_forever()