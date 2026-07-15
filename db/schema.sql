-- WhatsApp Sender Database Schema

-- Numbers (WhatsApp instances)
CREATE TABLE IF NOT EXISTS numbers (
  id          SERIAL PRIMARY KEY,
  instance    TEXT UNIQUE NOT NULL,
  phone       TEXT,
  status      TEXT DEFAULT 'active',
  proxy_host  TEXT,
  proxy_port  INTEGER,
  messages_sent_today  INTEGER DEFAULT 0,
  replies_received_today INTEGER DEFAULT 0,
  reply_rate  FLOAT DEFAULT 1.0,
  created_at  TIMESTAMP DEFAULT NOW(),
  last_used   TIMESTAMP,
  restricted_at TIMESTAMP
);

-- Recipients
CREATE TABLE IF NOT EXISTS recipients (
  id          SERIAL PRIMARY KEY,
  phone       TEXT UNIQUE NOT NULL,
  name        TEXT,
  status      TEXT DEFAULT 'pending',
  campaign_id TEXT,
  number_used TEXT,
  sent_at     TIMESTAMP,
  replied_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  message_template TEXT NOT NULL,
  total_recipients INTEGER DEFAULT 0,
  sent_count  INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'draft',
  created_at  TIMESTAMP DEFAULT NOW(),
  started_at  TIMESTAMP,
  completed_at TIMESTAMP
);

-- Send log
CREATE TABLE IF NOT EXISTS send_log (
  id          SERIAL PRIMARY KEY,
  campaign_id TEXT,
  recipient_phone TEXT,
  number_used TEXT,
  message_text TEXT,
  status      TEXT,
  timestamp   TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recipients_status ON recipients(status);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign ON recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_numbers_status ON numbers(status);
CREATE INDEX IF NOT EXISTS idx_send_log_campaign ON send_log(campaign_id);