#!/usr/bin/env python3
"""
WhatsApp Sender — Runs on the VPS alongside Evolution API.
Reads campaigns from Railway PostgreSQL, sends messages via Evolution API.
Anti-ban: rate limiting, random delays, spintax, round-robin across numbers.
"""
import requests
import time
import random
import json
import os
import re
import psycopg2
from datetime import datetime

# === Config ===
EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8082")
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Anti-ban settings
MAX_MSGS_PER_HOUR_PER_NUMBER = 20
MIN_DELAY_SECONDS = 30
MAX_DELAY_SECONDS = 90

# === Spintax Parser ===
def parse_spintax(text):
    """Convert {Hi|Hello|Hey} to a random choice"""
    pattern = r'\{([^}]+)\}'
    while True:
        match = re.search(pattern, text)
        if not match:
            break
        options = match.group(1).split('|')
        replacement = random.choice(options)
        text = text[:match.start()] + replacement + text[match.end():]
    return text

def build_message(template, name, phone):
    """Personalize + spintax + reply prompt"""
    personalized = template.replace("{name}", name or "").replace("{phone}", phone)
    spintaxed = parse_spintax(personalized)
    return spintaxed + "\n\nReply 1 to confirm you received this."

# === Rate Limiting ===
number_usage = {}  # instance -> [timestamps]

def can_send_from_number(instance):
    now = time.time()
    one_hour_go = now - 3600
    recent = [t for t in number_usage.get(instance, []) if t > one_hour_ago]
    number_usage[instance] = recent
    return len(recent) < MAX_MSGS_PER_HOUR_PER_NUMBER

def get_next_number(active_numbers):
    """Round-robin: find the next number under the rate limit"""
    for num in active_numbers:
        if can_send_from_number(num['instance']):
            return num
    return None

# === Send via Evolution API ===
def send_message(instance, phone, text):
    try:
        resp = requests.post(
            f"{EVOLUTION_URL}/message/sendText/{instance}",
            headers={
                "apikey": EVOLUTION_API_KEY,
                "Content-Type": "application/json"
            },
            json={"number": phone, "text": text},
            timeout=60
        )
        return resp.ok, resp.json() if resp.ok else resp.text
    except Exception as e:
        return False, str(e)

# === Database ===
def get_db():
    conn = psycopg2.connect(DATABASE_URL, sslmode='require')
    return conn

def get_active_numbers():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT instance FROM numbers WHERE status = 'active'")
    rows = cur.fetchall()
    conn.close()
    return [{"instance": r[0]} for r in rows]

def get_pending_recipients(campaign_id, limit=1000):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT phone, name FROM recipients WHERE campaign_id = %s AND status = 'pending' LIMIT %s",
        (campaign_id, limit)
    )
    rows = cur.fetchall()
    conn.close()
    return [{"phone": r[0], "name": r[1]} for r in rows]

def mark_sent(phone, number_used):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE recipients SET status = 'sent', number_used = %s, sent_at = NOW() WHERE phone = %s",
        (number_used, phone)
    )
    conn.commit()
    conn.close()

def log_send(campaign_id, phone, number_used, message_text, status):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO send_log (campaign_id, recipient_phone, number_used, message_text, status) VALUES (%s, %s, %s, %s, %s)",
        (campaign_id, phone, number_used, message_text, status)
    )
    conn.commit()
    conn.close()

def update_campaign_stats(campaign_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE campaigns SET
            sent_count = (SELECT COUNT(*) FROM recipients WHERE campaign_id = %s AND status IN ('sent', 'replied')),
            reply_count = (SELECT COUNT(*) FROM recipients WHERE campaign_id = %s AND status = 'replied'),
            total_recipients = (SELECT COUNT(*) FROM recipients WHERE campaign_id = %s)
        WHERE id = %s
    """, (campaign_id, campaign_id, campaign_id, campaign_id))
    conn.commit()
    conn.close()

# === Main Send Loop ===
def send_campaign(campaign_id, message_template):
    numbers = get_active_numbers()
    if not numbers:
        print("No active numbers!")
        return

    recipients = get_pending_recipients(campaign_id)
    if not recipients:
        print("No pending recipients!")
        return

    print(f"Campaign {campaign_id}: {len(recipients)} recipients, {len(numbers)} numbers")

    # Update campaign status
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE campaigns SET status = 'sending', started_at = NOW() WHERE id = %s", (campaign_id,))
    conn.commit()
    conn.close()

    sent = 0
    failed = 0
    skipped = 0

    for i, r in enumerate(recipients):
        # Get next available number
        number = get_next_number(numbers)
        if not number:
            print(f"[{i+1}/{len(recipients)}] All numbers at capacity, waiting 60s...")
            time.sleep(60)
            number = get_next_number(numbers)
        if not number:
            skipped += 1
            continue

        # Build message
        message = build_message(message_template, r['name'], r['phone'])
        instance = number['instance']

        # Send
        print(f"[{i+1}/{len(recipients)}] Sending to {r['phone']} via {instance}...")
        success, result = send_message(instance, r['phone'], message)

        if success:
            sent += 1
            number_usage.setdefault(instance, []).append(time.time())
            mark_sent(r['phone'], instance)
            log_send(campaign_id, r['phone'], instance, message, "sent")
        else:
            failed += 1
            log_send(campaign_id, r['phone'], instance, message, "failed")
            print(f"  Failed: {str(result)[:100]}")

        # Progress
        if (i + 1) % 10 == 0:
            print(f"  Progress: {sent} sent, {failed} failed, {skipped} skipped")

        # Random delay (30-90 seconds)
        delay = random.randint(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)
        print(f"  Waiting {delay}s...")
        time.sleep(delay)

    # Update stats
    update_campaign_stats(campaign_id)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = %s", (campaign_id,))
    conn.commit()
    conn.close()

    print(f"\nCampaign complete: {sent} sent, {failed} failed, {skipped} skipped")

# === Webhook handler (for replies) ===
def process_reply(phone, text, instance):
    """Called when a reply comes in via Evolution API webhook"""
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

# === CLI Entry Point ===
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 sender.py <campaign_id>")
        sys.exit(1)

    campaign_id = sys.argv[1]

    # Get campaign details
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT message_template FROM campaigns WHERE id = %s", (campaign_id,))
    row = cur.fetchone()
    conn.close()

    if not row:
        print(f"Campaign {campaign_id} not found!")
        sys.exit(1)

    send_campaign(campaign_id, row[0])