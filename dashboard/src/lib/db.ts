// PostgreSQL connection — shared between dashboard API routes
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || "";

// Parse the connection string to extract components
// Railway PostgreSQL needs SSL on public URL, no SSL on internal URL
// Use SSL only for external connections, not for Railway internal
const isInternal = connectionString.includes(".railway.internal");
export const pool = new Pool({
  connectionString,
  ssl: isInternal ? false : { rejectUnauthorized: false },
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

// Get active numbers
export async function getActiveNumbers() {
  const result = await query("SELECT * FROM numbers WHERE status = $1", ["active"]);
  return result.rows;
}

// Get pending recipients for a campaign
export async function getPendingRecipients(campaignId: string, limit = 1000) {
  const result = await query(
    "SELECT * FROM recipients WHERE campaign_id = $1 AND status = $2 LIMIT $3",
    [campaignId, "pending", limit]
  );
  return result.rows;
}

// Mark recipient as sent
export async function markSent(phone: string, numberUsed: string) {
  await query(
    "UPDATE recipients SET status = $1, number_used = $2, sent_at = NOW() WHERE phone = $3",
    ["sent", numberUsed, phone]
  );
}

// Mark recipient as replied
export async function markReplied(phone: string) {
  await query(
    "UPDATE recipients SET status = $1, replied_at = NOW() WHERE phone = $2",
    ["replied", phone]
  );
}

// Log every send attempt
export async function logSend(campaignId: string, phone: string, numberUsed: string, messageText: string, status: string) {
  await query(
    "INSERT INTO send_log (campaign_id, recipient_phone, number_used, message_text, status) VALUES ($1, $2, $3, $4, $5)",
    [campaignId, phone, numberUsed, messageText, status]
  );
}

// Update campaign stats
export async function updateCampaignStats(campaignId: string) {
  await query(`
    UPDATE campaigns SET
      sent_count = (SELECT COUNT(*) FROM recipients WHERE campaign_id = $1 AND status IN ('sent', 'replied')),
      reply_count = (SELECT COUNT(*) FROM recipients WHERE campaign_id = $1 AND status = 'replied'),
      total_recipients = (SELECT COUNT(*) FROM recipients WHERE campaign_id = $1)
    WHERE id = $1
  `, [campaignId]);
}

// Mark number as restricted
export async function markNumberRestricted(instance: string) {
  await query(
    "UPDATE numbers SET status = $1, restricted_at = NOW() WHERE instance = $2",
    ["restricted", instance]
  );
}

// Get campaign progress
export async function getCampaignProgress(campaignId: string) {
  const result = await query("SELECT * FROM campaigns WHERE id = $1", [campaignId]);
  return result.rows[0];
}

// Create campaign
export async function createCampaign(id: string, name: string, messageTemplate: string) {
  await query(
    "INSERT INTO campaigns (id, name, message_template, status) VALUES ($1, $2, $3, $4)",
    [id, name, messageTemplate, "draft"]
  );
}

// Add recipient — per-campaign (not global)
export async function addRecipient(phone: string, name: string, campaignId: string) {
  await query(
    "INSERT INTO recipients (phone, name, status, campaign_id) VALUES ($1, $2, $3, $4) ON CONFLICT (phone, campaign_id) DO UPDATE SET status = $3",
    [phone, name, "pending", campaignId]
  );
}

// Get all campaigns
export async function getCampaigns() {
  const result = await query("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 20");
  return result.rows;
}

// Get non-responders for a campaign (sent but not replied)
export async function getNonResponders(campaignId: string) {
  const result = await query(
    "SELECT phone, name FROM recipients WHERE campaign_id = $1 AND status = 'sent'",
    [campaignId]
  );
  return result.rows;
}

// Create follow-up campaign from non-responders
export async function createFollowupCampaign(originalCampaignId: string, followupName: string, messageTemplate: string) {
  const { randomUUID } = await import("crypto");
  const newId = randomUUID();
  
  // Create the campaign
  await createCampaign(newId, followupName, messageTemplate);
  
  // Copy non-responders from original campaign
  await query(
    `INSERT INTO recipients (phone, name, status, campaign_id)
     SELECT phone, name, 'pending', $1
     FROM recipients
     WHERE campaign_id = $2 AND status = 'sent'
     ON CONFLICT (phone, campaign_id) DO NOTHING`,
    [newId, originalCampaignId]
  );
  
  // Get count
  const countResult = await query("SELECT COUNT(*) FROM recipients WHERE campaign_id = $1", [newId]);
  return { id: newId, count: parseInt(countResult.rows[0].count) };
}

// Save message template
export async function saveTemplate(name: string, content: string) {
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  await query("INSERT INTO message_templates (id, name, content) VALUES ($1, $2, $3)", [id, name, content]);
  return id;
}

// Get all templates
export async function getTemplates() {
  const result = await query("SELECT * FROM message_templates ORDER BY created_at DESC");
  return result.rows;
}

// Get opt-out count
export async function getOptOutCount() {
  const result = await query("SELECT COUNT(*) FROM opt_out_list");
  return parseInt(result.rows[0].count);
}

// ===== Contacts (global address book — populated via webhook or CSV) =====

// Ensure the contacts table exists (idempotent). Called lazily by API routes
// so we don't need a separate migration step.
export async function ensureContactsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      name TEXT,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT
    )
  `);
  // Helpful indexes for the table view (safe to run repeatedly)
  await query("CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts (status)");
  await query("CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone)");
  await query("CREATE INDEX IF NOT EXISTS contacts_created_at_idx ON contacts (created_at DESC)");
}

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  source: string | null;
  status: string;
  created_at: string | null;
  notes: string | null;
}

// Insert a single contact. Returns the row. Upserts on phone so webhook
// re-sends don't create duplicates.
export async function addContact(input: {
  phone: string;
  name?: string | null;
  source?: string | null;
  notes?: string | null;
}): Promise<Contact> {
  await ensureContactsTable();
  const { randomUUID } = await import("crypto");
  const id = randomUUID();
  const phone = input.phone.replace(/\s/g, "").replace(/^\+/, "");
  const result = await query(
    `INSERT INTO contacts (id, phone, name, source, status, notes)
     VALUES ($1, $2, $3, $4, 'pending', $5)
     ON CONFLICT (phone) DO UPDATE
       SET name = COALESCE(EXCLUDED.name, contacts.name),
           source = COALESCE(EXCLUDED.source, contacts.source),
           notes = COALESCE(EXCLUDED.notes, contacts.notes)
     RETURNING *`,
    [id, phone, input.name ?? null, input.source ?? null, input.notes ?? null]
  );
  return result.rows[0] as Contact;
}

// Bulk insert. Uses a single transaction for speed. Skips empties + normalises phone.
export async function addContactsBulk(
  items: { phone: string; name?: string | null; source?: string | null; notes?: string | null }[],
  defaultSource?: string | null
): Promise<{ inserted: number; skipped: number }> {
  await ensureContactsTable();
  const { randomUUID } = await import("crypto");

  const clean = items
    .map((it) => ({
      phone: (it.phone || "").replace(/\s/g, "").replace(/^\+/, ""),
      name: it.name ?? null,
      source: it.source ?? defaultSource ?? null,
      notes: it.notes ?? null,
    }))
    .filter((c) => c.phone.length > 0);

  if (clean.length === 0) return { inserted: 0, skipped: items.length };

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    let inserted = 0;
    for (const c of clean) {
      const id = randomUUID();
      const res = await conn.query(
        `INSERT INTO contacts (id, phone, name, source, status, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (phone) DO NOTHING
         RETURNING id`,
        [id, c.phone, c.name, c.source, c.notes]
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
    }
    await conn.query("COMMIT");
    return { inserted, skipped: clean.length - inserted };
  } catch (e) {
    await conn.query("ROLLBACK");
    throw e;
  } finally {
    conn.release();
  }
}

export interface ListContactsResult {
  contacts: Contact[];
  total: number;
}

// Paginated + filtered list for the table view.
export async function listContacts(opts: {
  search?: string;
  status?: string; // 'all' or one of pending/sent/replied/stopped
  limit?: number;
  offset?: number;
}): Promise<ListContactsResult> {
  await ensureContactsTable();
  const limit = Math.max(1, Math.min(500, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const search = opts.search?.trim() || null;

  const where: string[] = [];
  const params: any[] = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    where.push(`(name ILIKE $${idx} OR phone ILIKE $${idx})`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const totalRes = await query(`SELECT COUNT(*) FROM contacts ${whereClause}`, params);
  const total = parseInt(totalRes.rows[0].count, 10);

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rowsRes = await query(
    `SELECT * FROM contacts ${whereClause} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return { contacts: rowsRes.rows as Contact[], total };
}

// Delete a single contact by phone. Returns true if a row was removed.
export async function deleteContactByPhone(phone: string): Promise<boolean> {
  await ensureContactsTable();
  const r = await query("DELETE FROM contacts WHERE phone = $1", [phone]);
  return (r.rowCount ?? 0) > 0;
}

// Update status of a contact by phone (used by send/reply pipelines).
export async function setContactStatus(phone: string, status: string): Promise<void> {
  await ensureContactsTable();
  await query("UPDATE contacts SET status = $1 WHERE phone = $2", [status, phone]);
}

// Fetch all contacts (no pagination) — used for CSV export.
export async function listAllContacts(): Promise<Contact[]> {
  await ensureContactsTable();
  const res = await query("SELECT * FROM contacts ORDER BY created_at DESC");
  return res.rows as Contact[];
}