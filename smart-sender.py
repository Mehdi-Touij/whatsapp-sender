#!/usr/bin/env python3
"""
Smart WhatsApp Sender — Auto-rotation + Warmup tracking
- Checks how many active numbers, rotates automatically
- Respects warmup limits (Day 1: 20/day, Day 2: 60/day, Day 3: 100/day, Day 4+: 160/day)
- Tracks per-number stats (sent today, total, replies)
- Detects bans and removes numbers from rotation
- Smart delay: 30-90s random between sends
"""
import requests
import time
import random
import json
import os
import re
import psycopg2
from datetime import datetime, date

EVOLUTION_URL = os.environ.get("EVOLUTION_URL", "http://localhost:8082")
EVOLUTION_API_KEY = os.environ.get("EVOLUTION_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# No warmup limits — all numbers use the same daily limit
# Rule: 20 messages per hour per number, 160 per day per number
def get_effective_limit(warmup_status, warmup_day, daily_limit):
    return daily_limit or 160

MAX_HOURLY = 20
MIN_DELAY = 30
MAX_DELAY = 90

# === Spintax ===
def parse_spintax(text):
    pattern = r'\{([^}]+)\}'
    while True:
        match = re.search(pattern, text)
        if not match:
            break
        options = match.group(1).split('|')
        text = text[:match.start()] + random.choice(options) + text[match.end():]
    return text

def build_message(template, name):
    msg = template.replace("{name}", name or "")
    msg = parse_spintax(msg)
    msg += "\n\nReply 1 to confirm you received this."
    return msg

# === Database ===
def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def get_smart_numbers():
    """Get all numbers with their current stats and warmup status"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT instance, display_name, phone, status, warmup_status, warmup_day,
               msgs_sent_today, msgs_sent_total, replies_total, daily_limit, hourly_limit,
               last_reset_date, last_message_at
        FROM numbers
        WHERE status = 'active'
        ORDER BY msgs_sent_today ASC
    """)
    rows = cur.fetchall()
    conn.close()
    
    numbers = []
    today = date.today()
    for r in rows:
        instance, display_name, phone, status, warmup_status, warmup_day, msgs_today, msgs_total, replies, daily_limit, hourly_limit, last_reset, last_msg = r
        
        # Reset daily counter if new day
        if last_reset != today:
            msgs_today = 0
        
        # Calculate effective daily limit — same for all numbers (no warmup)
        if warmup_status == 'warmup':
            effective_limit = daily_limit or 160
        else:
            effective_limit = daily_limit or 160
        
        numbers.append({
            'instance': instance,
            'display_name': display_name or instance,
            'phone': phone,
            'warmup_status': warmup_status,
            'warmup_day': warmup_day,
            'msgs_today': msgs_today,
            'effective_limit': effective_limit,
            'hourly_limit': hourly_limit or MAX_HOURLY,
            'msgs_total': msgs_total,
            'replies': replies,
            'last_msg': last_msg,
        })
    return numbers

def get_hourly_count(instance):
    """Count messages sent in the last hour by this number"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT COUNT(*) FROM send_log 
        WHERE number_used = %s AND status = 'sent' AND timestamp > NOW() - INTERVAL '1 hour'
    """, (instance,))
    count = cur.fetchone()[0]
    conn.close()
    return count

def get_next_number(numbers):
    """Smart rotation: pick the number with the least messages today that's still under limits"""
    today = date.today()
    for num in numbers:
        # Skip if at daily limit
        if num['msgs_today'] >= num['effective_limit']:
            continue
        # Skip if at hourly limit
        hourly = get_hourly_count(num['instance'])
        if hourly >= num['hourly_limit']:
            continue
        # Skip if last message was less than 60 seconds ago
        if num['last_msg']:
            elapsed = (datetime.now() - num['last_msg'].replace(tzinfo=None)).total_seconds()
            if elapsed < 60:
                continue
        return num
    return None

def prewarm_contact(instance, phone):
    """Send a typing presence update to the contact before sending the message.
    This triggers Baileys to fetch the tctoken for that contact."""
    try:
        # Use the chat/whatsappNumbers endpoint to check the number exists
        # This also triggers LID resolution which helps with tctoken
        resp = requests.post(
            f"{EVOLUTION_URL}/chat/whatsappNumbers/{instance}",
            headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
            json={"numbers": [phone]},
            timeout=30
        )
        if resp.ok:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                exists = data[0].get("exists", False)
                jid = data[0].get("jid", "")
                return exists, jid
        return False, ""
    except Exception as e:
        return False, str(e)

def send_message(instance, phone, text):
    try:
        # Step 1: Pre-warm the contact (triggers tctoken fetch)
        prewarm_contact(instance, phone)
        
        # Step 2: Wait 2 seconds for tctoken to be fetched
        time.sleep(2)
        
        # Step 3: Send the actual message
        resp = requests.post(
            f"{EVOLUTION_URL}/message/sendText/{instance}",
            headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
            json={"number": phone, "text": text},
            timeout=60
        )
        if not resp.ok:
            return False, resp.text
        
        data = resp.json()
        status = data.get("status", "")
        
        # If PENDING, the message was accepted. Wait 3s and check if it gets delivered
        # If 463 error occurred, the tctoken was fetched during prewarm — retry once
        if status == "PENDING":
            # Wait 3 seconds for tctoken to be processed
            time.sleep(3)
            # Retry the send — now with tctoken available
            resp2 = requests.post(
                f"{EVOLUTION_URL}/message/sendText/{instance}",
                headers={"apikey": EVOLUTION_API_KEY, "Content-Type": "application/json"},
                json={"number": phone, "text": text},
                timeout=60
            )
            if resp2.ok:
                data2 = resp2.json()
                status2 = data2.get("status", "")
                if status2 in ("SENT", "DELIVERED", "READ"):
                    return True, data2
                # Even if still PENDING, accept it (Baileys will retry delivery)
                return True, data2
        
        if status in ("SENT", "DELIVERED", "READ"):
            return True, data
        elif status == "PENDING":
            return True, data
        else:
            return False, data
    except Exception as e:
        return False, str(e)

def update_number_stats(instance, success):
    conn = get_db()
    cur = conn.cursor()
    today = date.today()
    if success:
        cur.execute("""
            UPDATE numbers SET 
                msgs_sent_today = msgs_sent_today + 1,
                msgs_sent_total = msgs_sent_total + 1,
                last_message_at = NOW(),
                last_reset_date = %s
            WHERE instance = %s
        """, (today, instance))
    conn.commit()
    conn.close()

def mark_number_banned(instance):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE numbers SET status = 'restricted', restricted_at = NOW() WHERE instance = %s", (instance,))
    conn.commit()
    conn.close()
    print(f"🚫 Number {instance} BANNED — removed from rotation")

def check_number_connection(instance):
    """Check if number is still connected via Evolution API"""
    try:
        resp = requests.get(
            f"{EVOLUTION_URL}/instance/connectionState/{instance}",
            headers={"apikey": EVOLUTION_API_KEY},
            timeout=10
        )
        data = resp.json()
        state = data.get('instance', {}).get('state', 'close')
        return state == 'open'
    except:
        return False

def advance_warmup(instance, current_day):
    """Advance warmup day if 24 hours have passed"""
    conn = get_db()
    cur = conn.cursor()
    new_day = current_day + 1
    if new_day >= 4:
        cur.execute("UPDATE numbers SET warmup_status = 'active', warmup_day = 4 WHERE instance = %s", (instance,))
        print(f"✅ {instance} graduated from warmup → active")
    else:
        cur.execute("UPDATE numbers SET warmup_day = %s WHERE instance = %s", (new_day, instance))
        print(f"📈 {instance} warmup day {current_day} → {new_day}")
    conn.commit()
    conn.close()

def get_pending_recipients(campaign_id, limit=1000):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT phone, name FROM recipients WHERE campaign_id = %s AND status = 'pending' LIMIT %s", (campaign_id, limit))
    rows = cur.fetchall()
    conn.close()
    return [{"phone": r[0], "name": r[1]} for r in rows]

def mark_sent(phone, number_used, campaign_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE recipients SET status = 'sent', number_used = %s, sent_at = NOW() WHERE phone = %s AND campaign_id = %s", (number_used, phone, campaign_id))
    conn.commit()
    conn.close()

def log_send(campaign_id, phone, number_used, status):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO send_log (campaign_id, recipient_phone, number_used, status) VALUES (%s, %s, %s, %s)", (campaign_id, phone, number_used, status))
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

# === Main Smart Send Loop ===
def send_campaign(campaign_id, message_template):
    print(f"\n{'='*60}")
    print(f"Smart Campaign: {campaign_id}")
    print(f"{'='*60}")
    
    # Get all available numbers
    numbers = get_smart_numbers()
    active = [n for n in numbers if n['warmup_status'] == 'active']
    warmup = [n for n in numbers if n['warmup_status'] == 'warmup']
    
    print(f"Numbers: {len(active)} active, {len(warmup)} in warmup")
    for n in numbers:
        limit = n['effective_limit']
        print(f"  {n['display_name']}: {n['msgs_today']}/{limit} today ({n['warmup_status']})")
    
    total_capacity = sum(n['effective_limit'] - n['msgs_today'] for n in numbers)
    print(f"Total remaining capacity today: {total_capacity} messages")
    
    # Get recipients
    recipients = get_pending_recipients(campaign_id)
    if not recipients:
        print("No pending recipients!")
        return
    
    print(f"Recipients: {len(recipients)}")
    
    if len(recipients) > total_capacity:
        print(f"⚠️  Not enough capacity! Can send {total_capacity} of {len(recipients)} today")
        print(f"   Remaining {len(recipients) - total_capacity} will be queued for tomorrow")
    
    # Update campaign status
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE campaigns SET status = 'sending', started_at = NOW() WHERE id = %s", (campaign_id,))
    conn.commit()
    conn.close()
    
    sent = 0
    failed = 0
    skipped = 0
    banned_count = 0
    
    for i, r in enumerate(recipients):
        # Refresh number stats every 10 sends
        if i > 0 and i % 10 == 0:
            numbers = get_smart_numbers()
        
        # Get next available number
        number = get_next_number(numbers)
        
        if not number:
            # All numbers at capacity
            remaining = len(recipients) - i
            print(f"\n⏸️  All numbers at capacity. {remaining} recipients queued for tomorrow.")
            break
        
        instance = number['instance']
        
        # Check connection before each send
        if not check_number_connection(instance):
            print(f"  ⚠️ {instance} not connected — skipping, trying next number")
            numbers = [n for n in numbers if n['instance'] != instance]
            # Try next number
            number = get_next_number(numbers)
            if not number:
                print(f"  ⏸️ No available numbers — stopping")
                break
            instance = number['instance']
        
        # Build message
        message = build_message(message_template, r['name'])
        
        # Send
        print(f"[{i+1}/{len(recipients)}] {r['phone']} via {number['display_name']} ({number['msgs_today']}/{number['effective_limit']})...")
        success, result = send_message(instance, r['phone'], message)
        
        if success:
            sent += 1
            update_number_stats(instance, True)
            number['msgs_today'] += 1
            mark_sent(r['phone'], instance, campaign_id)
            log_send(campaign_id, r['phone'], instance, "sent")
        else:
            err_str = str(result)[:200]
            print(f"  ❌ Failed: {err_str}")
            log_send(campaign_id, r['phone'], instance, "failed")
            
            # Check if number is banned or disconnected
            is_connection_error = 'Connection Closed' in str(result) or 'connection' in str(result).lower()
            is_banned = 'blocked' in str(result).lower() or 'banned' in str(result).lower() or 'restricted' in str(result).lower()
            
            if is_banned:
                mark_number_banned(instance)
                banned_count += 1
                numbers = [n for n in numbers if n['instance'] != instance]
                print(f"  🚫 {instance} appears banned — removed from rotation")
                # Don't mark recipient as failed — leave pending for retry with another number
                continue
            elif is_connection_error:
                print(f"  ⚠️ {instance} connection dropped — trying next number")
                # Remove this number from rotation temporarily
                numbers = [n for n in numbers if n['instance'] != instance]
                # Don't mark recipient as failed — leave pending for retry
                # Try again with a different number if available
                if numbers:
                    number = get_next_number(numbers)
                    if number:
                        instance = number['instance']
                        success2, result2 = send_message(instance, r['phone'], message)
                        if success2:
                            sent += 1
                            update_number_stats(instance, True)
                            number['msgs_today'] += 1
                            mark_sent(r['phone'], instance, campaign_id)
                            log_send(campaign_id, r['phone'], instance, "sent")
                            print(f"  ✅ Sent via fallback {number['display_name']}")
                            continue
                # If no fallback worked, mark as failed
                conn = get_db()
                cur = conn.cursor()
                cur.execute("UPDATE recipients SET status = 'failed' WHERE phone = %s AND campaign_id = %s", (r['phone'], campaign_id))
                conn.commit()
                conn.close()
                failed += 1
            else:
                # Other error — mark as failed
                conn = get_db()
                cur = conn.cursor()
                cur.execute("UPDATE recipients SET status = 'failed' WHERE phone = %s AND campaign_id = %s", (r['phone'], campaign_id))
                conn.commit()
                conn.close()
                failed += 1
        
        # Progress report every 10 sends
        if (i + 1) % 10 == 0:
            print(f"  📊 Progress: {sent} sent, {failed} failed, {banned_count} banned")
        
        # Smart delay
        delay = random.randint(MIN_DELAY, MAX_DELAY)
        time.sleep(delay)
    
    # Final stats
    update_campaign_stats(campaign_id)
    conn = get_db()
    cur = conn.cursor()
    # Count actual pending recipients in DB (not just the limited list)
    cur.execute("SELECT COUNT(*) FROM recipients WHERE campaign_id = %s AND status = 'pending'", (campaign_id,))
    remaining = cur.fetchone()[0]
    if remaining > 0:
        cur.execute("UPDATE campaigns SET status = 'partial' WHERE id = %s", (campaign_id,))
    else:
        cur.execute("UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = %s", (campaign_id,))
    conn.commit()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"✅ Campaign {'complete' if remaining == 0 else 'partial'}: {sent} sent, {failed} failed, {banned_count} banned")
    if remaining > 0:
        print(f"📋 {remaining} recipients will be sent tomorrow when capacity resets")
    print(f"{'='*60}")

# === CLI ===
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 smart-sender.py <campaign_id>")
        sys.exit(1)
    
    campaign_id = sys.argv[1]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT message_template FROM campaigns WHERE id = %s", (campaign_id,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        print(f"Campaign {campaign_id} not found!")
        sys.exit(1)
    
    send_campaign(campaign_id, row[0])