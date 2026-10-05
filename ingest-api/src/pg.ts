import pg from 'pg';

// Control-plane pool (app keys, partners, campaigns). Optional in dev: if
// POSTGRES_URL is unset we run without it and fall back to DEV_APP_KEYS.
export const pool = process.env.POSTGRES_URL
  ? new pg.Pool({ connectionString: process.env.POSTGRES_URL, max: 10 })
  : null;

export async function pingPostgres(): Promise<boolean> {
  if (!pool) return false;
  try { await pool.query('SELECT 1'); return true; } catch { return false; }
}
