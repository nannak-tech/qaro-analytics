import { isEventName, PROVENANCE, AD_EVENTS, type EventName } from './taxonomy.js';
import type { EventRow } from './pg.js';

export interface IngestContext {
  appName: string;      // resolved from the app key
  tsServer: Date;
  geoCountry: string;
  geoCity: string;
}

type Ok = { ok: true; row: EventRow };
type Err = { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asStr = (v: unknown, max = 512): string =>
  v == null ? '' : String(v).slice(0, max);
const asNumOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function isoClient(v: unknown, fallback: Date): string {
  const d = typeof v === 'string' ? new Date(v) : null;
  return (d && !isNaN(d.getTime()) ? d : fallback).toISOString();
}

/** Validate one raw event against the taxonomy + envelope, producing a flat row. */
export function validateEvent(raw: any, ctx: IngestContext): Ok | Err {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'event not an object' };

  const name = raw.event_name;
  if (!isEventName(name)) return { ok: false, error: `unknown event_name: ${asStr(name, 64)}` };
  const eventName = name as EventName;

  const eventId = asStr(raw.event_id, 64);
  if (!eventId) return { ok: false, error: 'missing event_id' };
  if (!UUID_RE.test(eventId)) return { ok: false, error: 'event_id not a uuid' };

  const anonymousId = asStr(raw.anonymous_id, 128);
  const sessionId = asStr(raw.session_id, 128);
  if (!anonymousId || !sessionId) return { ok: false, error: 'missing anonymous_id or session_id' };

  // Ad events must carry the ad block (billable integrity).
  const ad = (raw.ad && typeof raw.ad === 'object') ? raw.ad : {};
  if (AD_EVENTS.has(eventName) && !asStr(ad.campaign_id)) {
    return { ok: false, error: `${eventName} missing ad.campaign_id` };
  }

  const app = (raw.app && typeof raw.app === 'object') ? raw.app : {};
  const device = (raw.device && typeof raw.device === 'object') ? raw.device : {};
  const geo = (raw.geo && typeof raw.geo === 'object') ? raw.geo : {};

  let properties: Record<string, unknown> = {};
  if (raw.properties && typeof raw.properties === 'object' && !Array.isArray(raw.properties)) {
    // cap serialized size to keep rows small
    try {
      if (JSON.stringify(raw.properties).length <= 8192) properties = raw.properties;
    } catch { properties = {}; }
  }

  const row: EventRow = {
    event_id: eventId,
    event_name: eventName,
    provenance: PROVENANCE[eventName],
    ts_server: ctx.tsServer.toISOString(),
    ts_client: isoClient(raw.ts_client, ctx.tsServer),
    anonymous_id: anonymousId,
    customer_id: asNumOrNull(raw.customer_id),
    customer_mobile: asStr(raw.customer_mobile, 24) || null,
    session_id: sessionId,
    app_name: asStr(app.name, 64) || ctx.appName,
    app_version: asStr(app.version, 32),
    platform: asStr(app.platform, 16),
    device_model: asStr(device.model, 64),
    os_version: asStr(device.os_version, 32),
    locale: asStr(device.locale, 16),
    screen: asStr(raw.screen, 64),
    lat: asNumOrNull(geo.lat),
    lng: asNumOrNull(geo.lng),
    campaign_id: asStr(ad.campaign_id, 64),
    ad_id: asStr(ad.ad_id, 64),
    placement: asStr(ad.placement, 48),
    partner_id: asStr(ad.partner_id, 64),
    geo_country: ctx.geoCountry,
    geo_city: ctx.geoCity,
    properties,
  };
  return { ok: true, row };
}
