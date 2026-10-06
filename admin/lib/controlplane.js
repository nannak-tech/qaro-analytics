// Server-side client for the ingest control-plane + auth endpoints. The
// internal key never reaches the browser. Per-partner scoping is enforced by
// the callers (server components / actions) from the verified session — these
// helpers are low-level and unscoped.
import 'server-only';

const BASE = process.env.INGEST_URL || 'http://ingest-api:4100';
const KEY = process.env.INTERNAL_QUERY_KEY || '';

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'x-internal-key': KEY,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `${path} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---- auth ----
export const login = (email, password) => call('POST', '/v1/auth/login', { email, password });
export const acceptInvite = (token, name, password) => call('POST', '/v1/auth/accept', { token, name, password });

// ---- partners ----
export const listPartners = () => call('GET', '/v1/control/partners').then((r) => r.partners);
export const getPartner = (id) => call('GET', `/v1/control/partners/${id}`).then((r) => r.partner);
export const createPartner = (name, kind) => call('POST', '/v1/control/partners', { name, kind }).then((r) => r.partner);
export const setPartnerStatus = (id, status) => call('POST', `/v1/control/partners/${id}/status`, { status });

// ---- campaigns ----
export const listCampaigns = (partnerId) => call('GET', `/v1/control/partners/${partnerId}/campaigns`).then((r) => r.campaigns);
export const getCampaign = (id) => call('GET', `/v1/control/campaigns/${id}`).then((r) => r.campaign);
export const createCampaign = (data) => call('POST', '/v1/control/campaigns', data).then((r) => r.campaign);
export const setCampaignStatus = (id, status) => call('POST', `/v1/control/campaigns/${id}/status`, { status });

// ---- ads ----
export const listAds = (campaignId) => call('GET', `/v1/control/campaigns/${campaignId}/ads`).then((r) => r.ads);
export const createAd = (data) => call('POST', '/v1/control/ads', data).then((r) => r.ad);
export const setAdStatus = (id, status) => call('POST', `/v1/control/ads/${id}/status`, { status });

// ---- invites ----
export const listInvites = (partnerId) => call('GET', `/v1/control/partners/${partnerId}/invites`).then((r) => r.invites);
export const createInvite = (partnerId, email, role) =>
  call('POST', `/v1/control/partners/${partnerId}/invites`, { email, role }).then((r) => r.token);
