#!/usr/bin/env python3
"""
Daily scheduler — runs on VPS as a background process.
- Auto-resumes partial campaigns when capacity resets at midnight
- Checks every 60 seconds
- Only starts campaigns that are in "partial" status
- Sends Telegram alert when campaign completes
"""
import os
import time
import psycopg2
import subprocess
import requests
from datetime import date

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Read Telegram bot token
TELEGRAM_BOT_TOKEN = ""
TELEGRAM_CHAT_ID = ""
with open("/opt/data/.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("TELEGRAM_BOT_TOKEN"):
            TELEGRAM_BOT_TOKEN = line.split("=", 1)[1]
        elif line.startswith("TELEGRAM_CHAT_ID"):
            TELEGRAM_CHAT_ID = line.split("=", 1)[1]

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def send_telegram(message):
    try:
        if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
            requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": message, "parse_mode": "Markdown"},
                timeout=10
            )
    except:
        pass

def reset_daily_counters():
    """Reset msgs_sent_today for all numbers at midnight + advance warmup days + cleanup stale numbers"""
    conn = get_db()
    cur = conn.cursor()
    today = date.today()
    
    # Cleanup: delete stale "connecting" numbers (older than 1 hour — never scanned)
    cur.execute("DELETE FROM numbers WHERE status = 'connecting' AND created_at < NOW() - INTERVAL '1 hour'")
    stale = cur.rowcount
    if stale > 0:
        print(f"🧹 Cleaned up {stale} stale 'connecting' numbers")
    
    # Cleanup: delete stale QR requests
    cur.execute("DELETE FROM qr_requests WHERE created_at < NOW() - INTERVAL '2 hours'")
    stale_qr = cur.rowcount
    if stale_qr > 0:
        print(f"🧹 Cleaned up {stale_qr} stale QR requests")
    
    # Advance warmup: increment warmup_day for numbers in warmup
    cur.execute("SELECT instance, warmup_day FROM numbers WHERE warmup_status = 'warmup' AND last_reset_date != %s", (today,))
    warmup_numbers = cur.fetchall()
    for instance, warmup_day in warmup_numbers:
        new_day = warmup_day + 1
        if new_day >= 4:
            cur.execute("UPDATE numbers SET warmup_status = 'active', warmup_day = 4 WHERE instance = %s", (instance,))
            print(f"✅ {instance} graduated from warmup -> active")
            send_telegram(f"✅ Number {instance} graduated from warmup and is now fully active!")
        else:
            cur.execute("UPDATE numbers SET warmup_day = %s WHERE instance = %s", (new_day, instance))
            print(f"📈 {instance} warmup day {warmup_day} -> {new_day}")
    
    # Reset daily counters
    cur.execute("UPDATE numbers SET msgs_sent_today = 0 WHERE last_reset_date != %s", (today,))
    cur.execute("UPDATE numbers SET last_reset_date = %s WHERE last_reset_date != %s", (today, today))
    conn.commit()
    conn.close()

def check_and_resume_campaigns():
    """Find partial campaigns and resume them"""
    conn = get_db()
    cur = conn.cursor()
    
    # Find campaigns that are partial (not all recipients sent)
    cur.execute("""
        SELECT c.id, c.name, c.message_template
        FROM campaigns c
        WHERE c.status = 'partial'
        AND c.auto_resume = true
        AND EXISTS (
            SELECT 1 FROM recipients r 
            WHERE r.campaign_id = c.id AND r.status = 'pending'
        )
    """)
    campaigns = cur.fetchall()
    conn.close()
    
    for camp_id, name, template in campaigns:
        print(f"📋 Auto-resuming campaign: {name} ({camp_id})")
        send_telegram(f"📋 *Auto-resuming campaign*: {name}")
        
        # Start the smart sender for this campaign
        env = os.environ.copy()
        env["EVOLUTION_URL"] = "http://localhost:8082"
        
        with open("/opt/data/evolution-api/.env") as f:
            for line in f:
                if "AUTHENTICATION" in line:
                    env["EVOLUTION_API_KEY"] = line.strip().split("=", 1)[1].strip()
        
        env["DATABASE_URL"] = DATABASE_URL
        
        subprocess.Popen(
            ["/opt/data/.venvs/pot-provider/bin/python", "/opt/data/whatsapp-sender/smart-sender.py", camp_id],
            env=env,
            stdout=open(f"/tmp/campaign-{camp_id}.log", "a"),
            stderr=subprocess.STDOUT
        )
        
        # Update status back to sending
        conn = get_db()
        cur = conn.cursor()
        cur.execute("UPDATE campaigns SET status = 'sending' WHERE id = %s", (camp_id,))
        conn.commit()
        conn.close()

def check_completed_campaigns():
    """Check if any sending campaigns have completed and alert"""
    conn = get_db()
    cur = conn.cursor()
    
    # Find campaigns that just completed (were sending, now all recipients are sent/replied/stopped)
    cur.execute("""
        UPDATE campaigns 
        SET status = 'completed', completed_at = NOW()
        WHERE status = 'sending'
        AND NOT EXISTS (
            SELECT 1 FROM recipients 
            WHERE campaign_id = campaigns.id AND status = 'pending'
        )
        RETURNING id, name, sent_count, reply_count, total_recipients
    """)
    
    completed = cur.fetchall()
    conn.commit()
    conn.close()
    
    for camp_id, name, sent, replies, total in completed:
        rate = f"{((replies / sent) * 100):.1f}%" if sent > 0 else "0%"
        msg = f"✅ *Campaign Complete*: {name}\n\n📊 Sent: {sent}/{total}\n💬 Replies: {replies} ({rate})"
        print(msg)
        send_telegram(msg)

def main():
    print("📅 Daily scheduler started...")
    last_reset_date = None
    
    while True:
        today = date.today()
        
        # Reset daily counters at midnight
        if last_reset_date != today:
            print(f"🌙 New day ({today}) — resetting daily counters...")
            reset_daily_counters()
            last_reset_date = today
        
        # Check for completed campaigns
        check_completed_campaigns()
        
        # Check and resume partial campaigns
        check_and_resume_campaigns()
        
        # Wait 60 seconds before next check
        time.sleep(60)

if __name__ == "__main__":
    main()