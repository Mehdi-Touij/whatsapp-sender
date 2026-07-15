# WhatsApp Sender — Build Plan & Status

## What We're Building

A self-hosted WhatsApp messaging system that sends 1,000+ messages/day to course subscribers using 7 WhatsApp numbers with per-number sticky proxies and anti-ban strategies.

## Architecture

```
Railway (free tier):
├── Evolution API (Docker)     → sends WhatsApp messages
├── PostgreSQL                  → stores campaigns, recipients, numbers
├── Redis                        → WhatsApp session persistence
├── Trigger.dev (worker)        → orchestrates sending with anti-ban logic
└── Next.js dashboard            → upload CSV, write message, monitor progress

External:
├── DataImpulse proxies         → 7 sticky Morocco residential IPs (~$3/mo)
└── 7 Moroccan SIM cards        → real numbers, each with own proxy
```

## Build Phases

| Phase | What | Status |
|-------|------|--------|
| 1 | Scaffold project + Docker compose + .env | ⬜ |
| 2 | Deploy Evolution API on Railway | ⬜ |
| 3 | Build web dashboard (CSV upload + message + monitor) | ⬜ |
| 4 | Build Trigger.dev tasks (sending + anti-ban logic) | ⬜ |
| 5 | Database schema + migrations | ⬜ |
| 6 | Webhook handler (reply tracking + ban detection) | ⬜ |
| 7 | add-number.sh script (proxy + QR per number) | ⬜ |
| 8 | Connect everything + test with 1 message | ⬜ |
| 9 | Warm-up (3 days low volume) | ⬜ |
| 10 | Full scale 1,000/day | ⬜ |

## File Structure

```
whatsapp-sender/
├── README.md                   → this file
├── docker-compose.yml          → Evolution API + PostgreSQL + Redis
├── .env.example                → template for env vars
├── .gitignore
├── Dockerfile                   → dashboard deployment
├── add-number.sh               → create WhatsApp instance with proxy
├── proxies/
│   └── EXAMPLE.env             → per-number proxy config template
├── tasks/
│   ├── send-broadcast.ts        → main sending task with anti-ban
│   ├── daily-scheduler.ts       → cron trigger for daily sends
│   └── webhook-handler.ts       → reply tracking + ban detection
├── dashboard/
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                → main dashboard
│       │   └── api/
│       │       ├── upload/route.ts     → CSV upload
│       │       ├── campaign/route.ts   → start/stop campaign
│       │       ├── status/route.ts     → real-time progress
│       │       └── webhook/route.ts    → Evolution API webhook
│       ├── lib/
│       │   ├── db.ts                   → PostgreSQL connection
│       │   ├── spintax.ts              → message variation parser
│       │   └── evolution.ts            → Evolution API client
│       └── components/
│           ├── UploadForm.tsx
│           ├── CampaignProgress.tsx
│           └── NumberStatus.tsx
└── db/
    └── schema.sql              → database creation script
```

## Anti-Ban Rules (Enforced in Code)

1. Max 20 messages/hour per number (hard limit)
2. Random 30-90 second delays between messages (never fixed)
3. "Reply 1 to confirm you received this" appended to every message
4. Spintax variation on message content ({Hi|Hello|Hey} → random pick)
5. Round-robin across 7 numbers (distribute load)
6. Each number has its own Morocco sticky proxy (never shared)
7. Proxy set before first QR scan (no IP-country jump)
8. 3-day warm-up (20 msgs/day → 60 → 100 → 160)
9. Auto-remove restricted numbers from rotation
10. Reply rate monitoring (pause number if <30% replies)
11. STOP opt-out handling (remove instantly)
12. No identical messages back-to-back

## Cost

| Item | Cost |
|------|------|
| 7 SIM cards | ~$25 one-time |
| DataImpulse proxies | ~$3/month |
| Railway | $0 (free tier) |
| Trigger.dev | $0 (free tier) |
| **Total monthly** | **~$3** |

## What User Needs to Provide

1. 7 Moroccan SIM cards with WhatsApp installed
2. DataImpulse account with $10 deposited
3. Phone to scan 7 QR codes (one per number)
4. First CSV of phone numbers + first message template