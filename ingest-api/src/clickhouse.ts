import { createClient } from '@clickhouse/client';

export const ch = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DB || 'qaro_analytics',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  // Buffer small bursts; we also batch at the ingest route.
  clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 },
});

// One flat row per event, matching qaro_analytics.events columns.
export interface EventRow {
  event_id: string;
  event_name: string;
  provenance: string;
  ts_server: string;   // 'YYYY-MM-DD HH:MM:SS.mmm'
  ts_client: string;
  anonymous_id: string;
  customer_id: number | null;
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
  properties: string;  // JSON string
}

export async function insertEvents(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  await ch.insert({
    table: 'events',
    values: rows,
    format: 'JSONEachRow',
  });
}

export async function pingClickHouse(): Promise<boolean> {
  try {
    await ch.ping();
    return true;
  } catch {
    return false;
  }
}
