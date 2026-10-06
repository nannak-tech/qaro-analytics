// Control-plane data access + password/invite crypto.
// This is the trusted data service: every function here is reached only via the
// x-internal-key-guarded control router, never by the public app.
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { pool } from './pg.js';

// ---- password hashing (scrypt, no external deps) ----------------------------
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const dk = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const h = Buffer.from(hashHex, 'hex');
  return dk.length === h.length && timingSafeEqual(dk, h);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// ---- types ------------------------------------------------------------------
export interface SafeUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;             // 'qaro_admin' | 'partner_admin' | 'partner_member'
  partner_id: string | null;
  partner_name: string | null;
  status: string;
}

const SAFE_USER_COLS = `
  u.id, u.email, u.name, u.role, u.partner_id, u.status,
  p.name AS partner_name`;

// ---- users / auth -----------------------------------------------------------
export async function findUserForLogin(email: string, password: string): Promise<SafeUser | null> {
  const { rows } = await pool.query(
    `SELECT ${SAFE_USER_COLS}, u.password_hash
       FROM users u LEFT JOIN partners p ON p.id = u.partner_id
      WHERE lower(u.email) = lower($1) AND u.status = 'active'
      LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  delete row.password_hash;
  return row as SafeUser;
}

/** Idempotently ensure a bootstrap qaro_admin exists (called on startup). */
export async function ensureAdminUser(email: string, password: string, name = 'QARO Admin'): Promise<void> {
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
  if (rowCount) return;
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role, partner_id, status)
     VALUES ($1, $2, $3, 'qaro_admin', NULL, 'active')`,
    [email, hashPassword(password), name],
  );
  console.log(`[ingest] bootstrap qaro_admin created: ${email}`);
}

// ---- partners ---------------------------------------------------------------
export async function listPartners(): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.kind, p.status, p.created_at,
            count(DISTINCT c.id) AS campaigns,
            count(DISTINCT u.id) AS users
       FROM partners p
       LEFT JOIN campaigns c ON c.partner_id = p.id
       LEFT JOIN users u ON u.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
  );
  return rows;
}

export async function getPartner(id: string): Promise<any | null> {
  const { rows } = await pool.query('SELECT * FROM partners WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createPartner(name: string, kind: string): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO partners (name, kind) VALUES ($1, $2) RETURNING *`,
    [name, kind],
  );
  return rows[0];
}

export async function setPartnerStatus(id: string, status: string): Promise<void> {
  await pool.query('UPDATE partners SET status = $2 WHERE id = $1', [id, status]);
}

// ---- campaigns --------------------------------------------------------------
export async function listCampaigns(partnerId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT c.*, count(a.id) AS ads
       FROM campaigns c LEFT JOIN ads a ON a.campaign_id = c.id
      WHERE c.partner_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    [partnerId],
  );
  return rows;
}

export async function getCampaign(id: string): Promise<any | null> {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createCampaign(partnerId: string, data: {
  name: string; status?: string; starts_at?: string | null; ends_at?: string | null; budget?: number | null;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO campaigns (partner_id, name, status, starts_at, ends_at, budget)
     VALUES ($1, $2, COALESCE($3,'draft'), $4, $5, $6) RETURNING *`,
    [partnerId, data.name, data.status ?? null, data.starts_at ?? null, data.ends_at ?? null, data.budget ?? null],
  );
  return rows[0];
}

export async function setCampaignStatus(id: string, status: string): Promise<void> {
  await pool.query('UPDATE campaigns SET status = $2 WHERE id = $1', [id, status]);
}

// ---- ads --------------------------------------------------------------------
export async function listAds(campaignId: string): Promise<any[]> {
  const { rows } = await pool.query(
    'SELECT * FROM ads WHERE campaign_id = $1 ORDER BY created_at DESC', [campaignId],
  );
  return rows;
}

export async function createAd(campaignId: string, partnerId: string, data: {
  placement: string; title?: string | null; image_url: string; target_url?: string | null; weight?: number;
}): Promise<any> {
  const { rows } = await pool.query(
    `INSERT INTO ads (campaign_id, partner_id, placement, title, image_url, target_url, weight)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7,1)) RETURNING *`,
    [campaignId, partnerId, data.placement, data.title ?? null, data.image_url, data.target_url ?? null, data.weight ?? 1],
  );
  return rows[0];
}

export async function setAdStatus(id: string, status: string): Promise<void> {
  await pool.query('UPDATE ads SET status = $2 WHERE id = $1', [id, status]);
}

// ---- invites ----------------------------------------------------------------
/** Create a single-use invite; returns the plaintext token (shown once). */
export async function createInvite(partnerId: string, email: string, role: string, ttlDays = 7): Promise<{ token: string; id: string }> {
  const token = randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO invites (partner_id, email, role, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval) RETURNING id`,
    [partnerId, email, role, sha256(token), ttlDays],
  );
  return { token, id: rows[0].id };
}

export async function listInvites(partnerId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT id, email, role, expires_at, accepted_at, created_at
       FROM invites WHERE partner_id = $1 ORDER BY created_at DESC`,
    [partnerId],
  );
  return rows;
}

/** Accept an invite: create the user, mark the invite used. Returns the user. */
export async function acceptInvite(token: string, name: string, password: string): Promise<SafeUser | { error: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM invites
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256(token)],
    );
    const inv = rows[0];
    if (!inv) { await client.query('ROLLBACK'); return { error: 'invite invalid or expired' }; }

    const dup = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [inv.email]);
    if (dup.rowCount) { await client.query('ROLLBACK'); return { error: 'an account with this email already exists' }; }

    const u = await client.query(
      `INSERT INTO users (email, password_hash, name, role, partner_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING id, email, name, role, partner_id, status`,
      [inv.email, hashPassword(password), name, inv.role, inv.partner_id],
    );
    await client.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [inv.id]);
    const p = await client.query('SELECT name FROM partners WHERE id = $1', [inv.partner_id]);
    await client.query('COMMIT');
    return { ...u.rows[0], partner_name: p.rows[0]?.name ?? null } as SafeUser;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
