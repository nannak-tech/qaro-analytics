// Server-side only. Calls the ingest-api query endpoints with the internal key,
// so INTERNAL_QUERY_KEY never reaches the browser. Used from server components.
import 'server-only';
import { rangeQS } from './range';

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

// `range` is { days } or { from, to }.
export const getEventCounts = (range) =>
  q(`/v1/metrics/events?${rangeQS(range)}`);

export const getFunnel = (steps, range) =>
  q(`/v1/funnel?steps=${encodeURIComponent(steps.join(','))}&${rangeQS(range)}`);

export const getAdMetrics = (partnerId, range) =>
  q(`/v1/metrics/ad?partner_id=${encodeURIComponent(partnerId)}&${rangeQS(range)}`);

export const getDaily = (range) =>
  q(`/v1/metrics/daily?${rangeQS(range)}`);

export const getScreens = (range) =>
  q(`/v1/metrics/screens?${rangeQS(range)}`);

export const getInteractions = (range) =>
  q(`/v1/metrics/interactions?${rangeQS(range)}`);

export const getUsers = (range, search = '') =>
  q(`/v1/users?${rangeQS(range)}${search ? `&q=${encodeURIComponent(search)}` : ''}`);

export const getUsersDaily = (range) =>
  q(`/v1/users/daily?${rangeQS(range)}`);

export const getUserActivity = (kind, uid, range) =>
  q(`/v1/users/activity?kind=${encodeURIComponent(kind)}&uid=${encodeURIComponent(uid)}&${rangeQS(range)}`);
