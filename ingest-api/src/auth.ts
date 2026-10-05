import { createHash } from 'node:crypto';
import { pool } from './pg.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// DEV_APP_KEYS = "app-name:plaintext,app-name:plaintext" — dev fallback when the
// Postgres app_keys table isn't populated yet.
const devKeys = new Map<string, string>(); // plaintext -> app_name
for (const pair of (process.env.DEV_APP_KEYS || '').split(',')) {
  const [appName, key] = pair.split(':');
  if (appName && key) devKeys.set(key.trim(), appName.trim());
}

// in-process cache of key_hash -> app_name (keys rarely change)
let keyCache = new Map<string, string>();
let cacheAt = 0;

async function loadKeys(): Promise<Map<string, string>> {
  if (!pool) return new Map();
  if (Date.now() - cacheAt < 60_000 && keyCache.size) return keyCache;
  try {
    const { rows } = await pool.query<{ key_hash: string; app_name: string }>(
      'SELECT key_hash, app_name FROM app_keys WHERE active = true',
    );
    keyCache = new Map(rows.map((r) => [r.key_hash, r.app_name]));
    cacheAt = Date.now();
  } catch { /* keep stale cache */ }
  return keyCache;
}

/** Resolve an X-QARO-App-Key value to an app name, or null if invalid. */
export async function resolveAppKey(key: string | undefined): Promise<string | null> {
  if (!key) return null;
  if (devKeys.has(key)) return devKeys.get(key)!;
  const keys = await loadKeys();
  return keys.get(sha256(key)) ?? null;
}
