#!/usr/bin/env python3
"""
VPS Server — handles QR requests from dashboard + campaign triggers.
Polls database for pending QR requests, generates them via Evolution API.
Also receives campaign start commands.
Runs on VPS port 8091.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import sys
import time
import threading
import psycopg2
import requests

# Read config
with open("/opt/data/evolution-api/.env") as f:
    for line in f:
        line = line.strip()
        if "AUTHENTICATION" in line:
            EVOLUTION_API_KEY = line.split("=", 1)[1].strip()

with open("/opt/data/whatsapp-sender/.db_url") as f:
    DB_URL = f.read().strip()

EVOLUTION_URL = "http://localhost:8082"

# === QR Request Poller ===
def poll_qr_requests():
    """Poll database for pending QR requests and generate them"""
    while True:
        try:
            conn = psycopg2.connect(DB_URL, sslmode='require')
            cur = conn.cursor()
            
            # Find pending QR requests + delete requests
            cur.execute("SELECT id, display_name, instance_name, status FROM qr_requests WHERE status IN ('pending', 'delete-request')")
            requests_pending = cur.fetchall()
            
            for req_id, display_name, instance_name, req_status in requests_pending:
                # Handle delete requests
                if req_status == "delete-request":
                    try:
                        resp = requests.delete(
                            f"{EVOLUTION_URL}/instance/delete/{instance_name}",
                            headers={"apikey": EVOLUTION_API_KEY},
                            timeout=10
                        )
                        print(f"[DEL] Deleted {instance_name} from Evolution API: {resp.status_code}")
                    except Exception as e:
                        print(f"[DEL] Error deleting {instance_name}: {e}")
                    cur.execute("DELETE FROM qr_requests WHERE id = %s", [req_id])
                    conn.commit()
                    continue
                
                # Handle QR creation requests
                print(f"[QR] Processing request for {display_name} ({instance_name})")
                
                try:
                    # Create instance in Evolution API
                    resp = requests.post(
                        f"{EVOLUTION_URL}/instance/create",
                        headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
                        json={"instanceName": instance_name, "qrcode": True, "integration": "WHATSAPP-BAILEYS"},
                        timeout=30
                    )
                    
                    if resp.ok:
                        data = resp.json()
                        code = ""
                        if "qrcode" in data and isinstance(data["qrcode"], dict):
                            code = data["qrcode"].get("code", "")
                        if not code and "code" in data:
                            code = data.get("code", "")
                        
                        if code:
                            # Store QR code in database
                            cur.execute(
                                "UPDATE qr_requests SET qr_code = %s, status = 'ready', completed_at = NOW() WHERE id = %s",
                                [code, req_id]
                            )
                            conn.commit()
                            
                            # Also insert into numbers table
                            cur.execute(
                                "INSERT INTO numbers (instance, display_name, status, warmup_status, warmup_day, daily_limit, hourly_limit) VALUES (%s, %s, 'connecting', 'warmup', 1, 160, 20) ON CONFLICT (instance) DO UPDATE SET display_name = %s",
                                [instance_name, display_name, display_name]
                            )
                            conn.commit()
                            print(f"[QR] ✅ QR generated for {display_name}")
                        else:
                            cur.execute("UPDATE qr_requests SET status = 'error' WHERE id = %s", [req_id])
                            conn.commit()
                            print(f"[QR] ❌ No QR code in response for {display_name}")
                    else:
                        cur.execute("UPDATE qr_requests SET status = 'error' WHERE id = %s", [req_id])
                        conn.commit()
                        print(f"[QR] ❌ Evolution API error: {resp.text[:100]}")
                        
                except Exception as e:
                    cur.execute("UPDATE qr_requests SET status = 'error' WHERE id = %s", [req_id])
                    conn.commit()
                    print(f"[QR] ❌ Error: {e}")
            
            conn.close()
        except Exception as e:
            print(f"[QR] Poll error: {e}")
        
        time.sleep(3)

# === Connection Poller — checks if "connecting" numbers have connected ===
def poll_connections():
    """Poll Evolution API for numbers in 'connecting' state and mark them active when connected."""
    while True:
        try:
            conn = psycopg2.connect(DB_URL, sslmode='require')
            cur = conn.cursor()
            
            cur.execute("SELECT instance, display_name FROM numbers WHERE status = 'connecting'")
            connecting = cur.fetchall()
            
            for instance, name in connecting:
                try:
                    resp = requests.get(
                        f"{EVOLUTION_URL}/instance/connectionState/{instance}",
                        headers={"apikey": EVOLUTION_API_KEY},
                        timeout=10
                    )
                    if resp.ok:
                        state = resp.json().get("instance", {}).get("state", "")
                        if state == "open":
                            cur.execute("UPDATE numbers SET status = 'active', warmup_status = 'warmup', warmup_day = 1 WHERE instance = %s", (instance,))
                            conn.commit()
                            print(f"[Connect] {name} ({instance}) is now ACTIVE")
                            
                            # Try to get phone number
                            try:
                                resp2 = requests.get(
                                    f"{EVOLUTION_URL}/instance/fetchInstances?instanceName={instance}",
                                    headers={"apikey": EVOLUTION_API_KEY},
                                    timeout=10
                                )
                                data2 = resp2.json()
                                if isinstance(data2, list) and len(data2) > 0:
                                    phone = data2[0].get("instance", {}).get("phone", "")
                                    if phone:
                                        if not phone.startswith("+"):
                                            phone = "+" + phone
                                        cur.execute("UPDATE numbers SET phone = %s WHERE instance = %s", (phone, instance))
                                        conn.commit()
                                        print(f"[Connect] {name} phone: {phone}")
                            except:
                                pass
                except Exception as e:
                    print(f"[Connect] Error checking {instance}: {e}")
            
            conn.close()
        except Exception as e:
            print(f"[Connect] Poll error: {e}")
        
        time.sleep(5)

# === HTTP Handler (for campaign triggers) ===
class TriggerHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            campaign_id = data.get("campaignId")
            
            if campaign_id and self.path == "/start-campaign":
                env = os.environ.copy()
                env["EVOLUTION_URL"] = EVOLUTION_URL
                env["EVOLUTION_API_KEY"] = EVOLUTION_API_KEY
                env["DATABASE_URL"] = DB_URL + "?sslmode=require"
                
                subprocess.Popen(
                    ["/opt/data/.venvs/pot-provider/bin/python", "/opt/data/whatsapp-sender/smart-sender.py", campaign_id],
                    env=env,
                    stdout=open(f"/tmp/campaign-{campaign_id}.log", "w"),
                    stderr=subprocess.STDOUT
                )
                print(f"[Campaign] Started {campaign_id}")
                self._respond({"ok": True, "campaignId": campaign_id})
            else:
                self._respond({"error": "Missing campaignId"}, 400)
        except Exception as e:
            self._respond({"error": str(e)}, 500)
    
    def do_GET(self):
        if self.path == "/health":
            self._respond({"ok": True, "service": "vps-server"})
        else:
            self._respond({"ok": True})
    
    def _respond(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    # Start QR poller in background thread
    qr_thread = threading.Thread(target=poll_qr_requests, daemon=True)
    qr_thread.start()
    print("[QR] Poller started — watching for QR requests from dashboard")
    
    # Start connection poller in background thread
    conn_thread = threading.Thread(target=poll_connections, daemon=True)
    conn_thread.start()
    print("[Connect] Poller started — watching for number connections")
    
    # Start HTTP server
    port = int(os.environ.get("TRIGGER_PORT", "8091"))
    server = HTTPServer(("0.0.0.0", port), TriggerHandler)
    print(f"[Server] Running on port {port}...")
    server.serve_forever()