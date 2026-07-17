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

// Add recipient
export async function addRecipient(phone: string, name: string, campaignId: string) {
  await query(
    "INSERT INTO recipients (phone, name, status, campaign_id) VALUES ($1, $2, $3, $4) ON CONFLICT (phone) DO UPDATE SET campaign_id = $4",
    [phone, name, "pending", campaignId]
  );
}

// Get all campaigns
export async function getCampaigns() {
  const result = await query("SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 20");
  return result.rows;
}