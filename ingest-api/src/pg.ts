import pg from 'pg';

if (!process.env.POSTGRES_URL) {
  console.warn('[ingest] POSTGRES_URL not set — inserts will fail until configured');
}

export const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  // RDS and most managed PG require TLS; allow self-signed chains.
  ssl: process.env.PGSSL === 'disable' ? undefined : { rejectUnauthorized: false },
});

export async function pingPostgres(): Promise<boolean> {
  try { await pool.query('SELECT 1'); return true; } catch { return false; }
}

// One flat row per event, matching the `events` table columns.
export interface EventRow {
  event_id: string;
  event_name: string;
  provenance: string;
  ts_server: string;   // ISO8601
  ts_client: string;   // ISO8601
  anonymous_id: string;
  customer_id: number | null;
  customer_mobile: string | null;
  session_id: string;
  app_name: string;
  app_version: string;
  platform: string;
  device_model: string;
  os_version: string;
  locale: string;
  screen: string;
  lat: number | null;
  lng: number | null;
  campaign_id: string;
  ad_id: string;
  placement: string;
  partner_id: string;
  geo_country: string;
  geo_city: string;
  properties: Record<string, unknown>;   // -> jsonb (node-pg serialises objects)
}

const COLS = [
  'event_id', 'event_name', 'provenance', 'ts_server', 'ts_client',
  'anonymous_id', 'customer_id', 'customer_mobile', 'session_id', 'app_name', 'app_version',
  'platform', 'device_model', 'os_version', 'locale', 'screen', 'lat', 'lng',
  'campaign_id', 'ad_id', 'placement', 'partner_id', 'geo_country', 'geo_city',
  'properties',
] as const;

/** Batch insert; dedupe by event_id so offline replays are idempotent. */
export async function insertEvents(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  const N = COLS.length;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((r, i) => {
    const base = i * N;
    tuples.push('(' + COLS.map((_, j) => `$${base + j + 1}`).join(',') + ')');
    values.push(
      r.event_id, r.event_name, r.provenance, r.ts_server, r.ts_client,
      r.anonymous_id, r.customer_id, r.customer_mobile, r.session_id, r.app_name, r.app_version,
      r.platform, r.device_model, r.os_version, r.locale, r.screen, r.lat, r.lng,
      r.campaign_id, r.ad_id, r.placement, r.partner_id, r.geo_country, r.geo_city,
      JSON.stringify(r.properties),
    );
  });
  const sql =
    `INSERT INTO events (${COLS.join(',')}) VALUES ${tuples.join(',')} ` +
    `ON CONFLICT (event_id) DO NOTHING`;
  await pool.query(sql, values);
}
