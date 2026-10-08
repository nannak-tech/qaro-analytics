// Server-side only. Calls the ingest-api query endpoints with the internal key,
// so INTERNAL_QUERY_KEY never reaches the browser. Used from server components.
import 'server-only';

const BASE = process.env.INGEST_URL || 'http://ingest-api:4100';
const KEY = process.env.INTERNAL_QUERY_KEY || '';

async function q(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-internal-key': KEY },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ingest ${path} -> ${res.status}`);
  return res.json();
}

export const getEventCounts = (days = 30) =>
  q(`/v1/metrics/events?days=${days}`);

export const getFunnel = (steps, days = 30) =>
  q(`/v1/funnel?steps=${encodeURIComponent(steps.join(','))}&days=${days}`);

export const getAdMetrics = (partnerId, days = 30) =>
  q(`/v1/metrics/ad?partner_id=${encodeURIComponent(partnerId)}&days=${days}`);

export const getScreens = (days = 30) =>
  q(`/v1/metrics/screens?days=${days}`);

export const getInteractions = (days = 30) =>
  q(`/v1/metrics/interactions?days=${days}`);

export const getUsers = (days = 30, search = '') =>
  q(`/v1/users?days=${days}${search ? `&q=${encodeURIComponent(search)}` : ''}`);

export const getUserActivity = (kind, uid, days = 90) =>
  q(`/v1/users/activity?kind=${encodeURIComponent(kind)}&uid=${encodeURIComponent(uid)}&days=${days}`);
