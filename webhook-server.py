#!/usr/bin/env python3
"""
Webhook receiver — runs on VPS port 8090.
Receives replies from Evolution API, updates database.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import psycopg2
import sys

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def process_reply(phone, text):
    """Update recipient status based on reply"""
    conn = get_db()
    cur = conn.cursor()
    if text.upper().startswith("STOP"):
        cur.execute("UPDATE recipients SET status = 'stopped' WHERE phone = %s", (phone,))
        print(f"Opt-out: {phone}")
    else:
        cur.execute("UPDATE recipients SET status = 'replied', replied_at = NOW() WHERE phone = %s", (phone,))
        print(f"Reply from {phone}: {text[:50]}")
    conn.commit()
    conn.close()

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            event = data.get("event", "")
            
            if event == "MESSAGES_UPSERT":
                msg_data = data.get("data", {})
                if not msg_data.get("key", {}).get("fromMe", False):
                    # Incoming message (reply)
                    phone = msg_data.get("key", {}).get("remoteJid", "").replace("@s.whatsapp.net", "")
                    text = msg_data.get("message", {}).get("conversation", "")
                    if phone and text:
                        process_reply(phone, text)
            
            elif event == "CONNECTION_UPDATE":
                state = data.get("data", {}).get("state", "")
                instance = data.get("instance", "")
                if state == "close":
                    conn = get_db()
                    cur = conn.cursor()
                    cur.execute("UPDATE numbers SET status = 'restricted', restricted_at = NOW() WHERE instance = %s", (instance,))
                    conn.commit()
                    conn.close()
                    print(f"Number {instance} restricted/banned!")
        except Exception as e:
            print(f"Error: {e}")
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')
    
    def log_message(self, format, *args):
        pass  # Suppress logs

if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "8090"))
    server = HTTPServer(("0.0.0.0", port), WebhookHandler)
    print(f"Webhook server running on port {port}...")
    server.serve_forever()