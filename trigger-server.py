#!/usr/bin/env python3
"""
Campaign trigger server — receives start command from dashboard, runs smart sender.
Also serves as a health check endpoint.
Runs on VPS port 8091.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
import subprocess
import sys

class TriggerHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            campaign_id = data.get("campaignId")
            
            if campaign_id and self.path == "/start-campaign":
                # Start smart sender in background
                env = os.environ.copy()
                env["EVOLUTION_URL"] = "http://localhost:8082"
                
                with open("/opt/data/evolution-api/.env") as f:
                    for line in f:
                        if "AUTHENTICATION" in line:
                            env["EVOLUTION_API_KEY"] = line.strip().split("=", 1)[1].strip()
                
                with open("/opt/data/whatsapp-sender/.db_url") as f:
                    env["DATABASE_URL"] = f.read().strip() + "?sslmode=require"
                
                subprocess.Popen(
                    ["/opt/data/.venvs/pot-provider/bin/python", "/opt/data/whatsapp-sender/smart-sender.py", campaign_id],
                    env=env,
                    stdout=open(f"/tmp/campaign-{campaign_id}.log", "w"),
                    stderr=subprocess.STDOUT
                )
                
                print(f"Started campaign {campaign_id}")
                self._respond({"ok": True, "campaignId": campaign_id})
            else:
                self._respond({"error": "Missing campaignId"}, 400)
        except Exception as e:
            self._respond({"error": str(e)}, 500)
    
    def do_GET(self):
        if self.path == "/health":
            self._respond({"ok": True, "service": "campaign-trigger"})
        else:
            self._respond({"ok": True})
    
    def _respond(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def log_message(self, format, *args):
        print(f"[trigger] {args[0] if args else ''}")

if __name__ == "__main__":
    port = int(os.environ.get("TRIGGER_PORT", "8091"))
    server = HTTPServer(("0.0.0.0", port), TriggerHandler)
    print(f"Campaign trigger server running on port {port}...")
    server.serve_forever()