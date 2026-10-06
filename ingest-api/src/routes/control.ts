import { Router, type Request, type Response, type NextFunction } from 'express';
import * as acct from '../accounts.js';

// Same internal guard as the query router. The admin BFF is the only caller;
// per-partner scoping is enforced there from the verified session, so these
// endpoints trust the caller and must never be exposed to partners directly.
function requireInternalKey(req: Request, res: Response, next: NextFunction) {
  const want = process.env.INTERNAL_QUERY_KEY;
  if (want && req.header('x-internal-key') !== want) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const KINDS = new Set(['garage', 'producer', 'auto_partner']);
const CAMPAIGN_STATUS = new Set(['draft', 'active', 'paused', 'ended']);
const ON_OFF = new Set(['active', 'paused', 'archived']);
const INVITE_ROLES = new Set(['partner_admin', 'partner_member']);

export const controlRouter = Router();
controlRouter.use('/v1/auth', requireInternalKey);
controlRouter.use('/v1/control', requireInternalKey);

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try { await fn(req, res); }
    catch (e: any) { res.status(500).json({ error: e?.message || 'server error' }); }
  };

// ---- auth -------------------------------------------------------------------
controlRouter.post('/v1/auth/login', wrap(async (req, res) => {
  const email = str(req.body?.email), password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = await acct.findUserForLogin(email, password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ user });
}));

controlRouter.post('/v1/auth/accept', wrap(async (req, res) => {
  const token = str(req.body?.token), name = str(req.body?.name), password = String(req.body?.password ?? '');
  if (!token || !name || password.length < 8) {
    return res.status(400).json({ error: 'token, name and an 8+ char password required' });
  }
  const r = await acct.acceptInvite(token, name, password);
  if ('error' in r) return res.status(400).json(r);
  res.json({ user: r });
}));

// ---- partners ---------------------------------------------------------------
controlRouter.get('/v1/control/partners', wrap(async (_req, res) => {
  res.json({ partners: await acct.listPartners() });
}));

controlRouter.post('/v1/control/partners', wrap(async (req, res) => {
  const name = str(req.body?.name);
  const kind = str(req.body?.kind) || 'garage';
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'invalid kind' });
  res.status(201).json({ partner: await acct.createPartner(name, kind) });
}));

controlRouter.get('/v1/control/partners/:id', wrap(async (req, res) => {
  const p = await acct.getPartner(String(req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({ partner: p });
}));

controlRouter.post('/v1/control/partners/:id/status', wrap(async (req, res) => {
  const status = str(req.body?.status);
  if (!ON_OFF.has(status)) return res.status(400).json({ error: 'invalid status' });
  await acct.setPartnerStatus(String(req.params.id), status);
  res.json({ ok: true });
}));

controlRouter.get('/v1/control/partners/:id/campaigns', wrap(async (req, res) => {
  res.json({ campaigns: await acct.listCampaigns(String(req.params.id)) });
}));

controlRouter.get('/v1/control/partners/:id/invites', wrap(async (req, res) => {
  res.json({ invites: await acct.listInvites(String(req.params.id)) });
}));

controlRouter.post('/v1/control/partners/:id/invites', wrap(async (req, res) => {
  const email = str(req.body?.email);
  const role = str(req.body?.role) || 'partner_member';
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!INVITE_ROLES.has(role)) return res.status(400).json({ error: 'invalid role' });
  const partner = await acct.getPartner(String(req.params.id));
  if (!partner) return res.status(404).json({ error: 'partner not found' });
  const { token } = await acct.createInvite(String(req.params.id), email, role);
  res.status(201).json({ token }); // plaintext token shown once to the admin
}));

// ---- campaigns --------------------------------------------------------------
controlRouter.post('/v1/control/campaigns', wrap(async (req, res) => {
  const partnerId = str(req.body?.partner_id);
  const name = str(req.body?.name);
  const status = str(req.body?.status) || 'draft';
  if (!partnerId || !name) return res.status(400).json({ error: 'partner_id and name required' });
  if (!CAMPAIGN_STATUS.has(status)) return res.status(400).json({ error: 'invalid status' });
  const budget = req.body?.budget != null && req.body.budget !== '' ? Number(req.body.budget) : null;
  if (budget != null && !Number.isFinite(budget)) return res.status(400).json({ error: 'invalid budget' });
  const campaign = await acct.createCampaign(partnerId, {
    name, status,
    starts_at: str(req.body?.starts_at) || null,
    ends_at: str(req.body?.ends_at) || null,
    budget,
  });
  res.status(201).json({ campaign });
}));

controlRouter.get('/v1/control/campaigns/:id', wrap(async (req, res) => {
  const c = await acct.getCampaign(String(req.params.id));
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json({ campaign: c });
}));

controlRouter.post('/v1/control/campaigns/:id/status', wrap(async (req, res) => {
  const status = str(req.body?.status);
  if (!CAMPAIGN_STATUS.has(status)) return res.status(400).json({ error: 'invalid status' });
  await acct.setCampaignStatus(String(req.params.id), status);
  res.json({ ok: true });
}));

controlRouter.get('/v1/control/campaigns/:id/ads', wrap(async (req, res) => {
  res.json({ ads: await acct.listAds(String(req.params.id)) });
}));

// ---- ads --------------------------------------------------------------------
controlRouter.post('/v1/control/ads', wrap(async (req, res) => {
  const campaignId = str(req.body?.campaign_id);
  const partnerId = str(req.body?.partner_id);
  const placement = str(req.body?.placement);
  const imageUrl = str(req.body?.image_url);
  if (!campaignId || !partnerId || !placement || !imageUrl) {
    return res.status(400).json({ error: 'campaign_id, partner_id, placement and image_url required' });
  }
  const weight = req.body?.weight != null && req.body.weight !== '' ? Number(req.body.weight) : 1;
  if (!Number.isFinite(weight) || weight < 1) return res.status(400).json({ error: 'invalid weight' });
  const ad = await acct.createAd(campaignId, partnerId, {
    placement, image_url: imageUrl,
    title: str(req.body?.title) || null,
    target_url: str(req.body?.target_url) || null,
    weight,
  });
  res.status(201).json({ ad });
}));

controlRouter.post('/v1/control/ads/:id/status', wrap(async (req, res) => {
  const status = str(req.body?.status);
  if (!ON_OFF.has(status)) return res.status(400).json({ error: 'invalid status' });
  await acct.setAdStatus(String(req.params.id), status);
  res.json({ ok: true });
}));
