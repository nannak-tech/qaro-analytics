import { Router, type Request, type Response, type NextFunction } from 'express';
import { pool } from '../pg.js';
import { isEventName } from '../taxonomy.js';

// Internal guard for query endpoints. The admin portal proxies to these with
// INTERNAL_QUERY_KEY; partner-scoping (partner_id from the session) is enforced
// by the admin layer. Never expose these directly to partners.
function requireQueryKey(req: Request, res: Response, next: NextFunction) {
  const want = process.env.INTERNAL_QUERY_KEY;
  if (want && req.header('x-internal-key') !== want) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

const days = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 400 ? Math.floor(n) : def;
};
const num = (v: unknown) => Number(v ?? 0);

export const queryRouter = Router();
queryRouter.use('/v1/metrics', requireQueryKey);
queryRouter.use('/v1/funnel', requireQueryKey);

// ---- Ad metrics: per-campaign impressions/clicks/CTR for a partner ----------
queryRouter.get('/v1/metrics/ad', async (req, res) => {
  const partnerId = String(req.query.partner_id || '');
  if (!partnerId) return res.status(400).json({ error: 'partner_id required' });
  const since = days(req.query.days, 30);
  try {
    const { rows } = await pool.query(
      `SELECT campaign_id,
              count(*) FILTER (WHERE event_name = 'ad_impression') AS impressions,
              count(*) FILTER (WHERE event_name = 'ad_click')      AS clicks
         FROM events
        WHERE partner_id = $1
          AND event_name IN ('ad_impression','ad_click')
          AND ts_server >= now() - ($2 || ' days')::interval
        GROUP BY campaign_id
        ORDER BY impressions DESC`,
      [partnerId, since],
    );
    const out = rows.map((r) => {
      const imp = num(r.impressions), clk = num(r.clicks);
      return { campaign_id: r.campaign_id, impressions: imp, clicks: clk,
               ctr: imp ? Math.round((clk / imp) * 1000) / 10 : 0 };
    });
    res.json({ partner_id: partnerId, days: since, rows: out });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Daily event counts (top-line volumes) ----------------------------------
queryRouter.get('/v1/metrics/events', async (req, res) => {
  const since = days(req.query.days, 30);
  try {
    const { rows } = await pool.query(
      `SELECT date_trunc('day', ts_server)::date AS day,
              event_name,
              count(*)                   AS events,
              count(distinct session_id) AS sessions,
              count(distinct customer_id) AS customers
         FROM events
        WHERE ts_server >= now() - ($1 || ' days')::interval
        GROUP BY day, event_name
        ORDER BY day`,
      [since],
    );
    res.json({ days: since, rows: rows.map((r) => ({
      day: r.day, event_name: r.event_name,
      events: num(r.events), sessions: num(r.sessions), customers: num(r.customers),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Top pages (screen_view grouped by page name) ---------------------------
queryRouter.get('/v1/metrics/screens', async (req, res) => {
  const since = days(req.query.days, 30);
  try {
    // Top pages are derived ONLY from screen_view events (a real page view),
    // not from every event that happens to carry a screen context — otherwise
    // lifecycle events (app_open, etc.) would surface as 0-view "pages".
    const { rows } = await pool.query(
      `SELECT screen,
              count(*)                     AS views,
              count(DISTINCT session_id)   AS sessions,
              count(DISTINCT customer_id)  AS customers
         FROM events
        WHERE event_name = 'screen_view'
          AND screen IS NOT NULL AND screen NOT IN ('', '/', 'unknown')
          AND screen NOT LIKE 'minified:%'
          AND ts_server >= now() - ($1 || ' days')::interval
        GROUP BY screen
        ORDER BY views DESC`,
      [since],
    );
    res.json({ days: since, rows: rows.map((r) => ({
      screen: r.screen, views: num(r.views),
      sessions: num(r.sessions), customers: num(r.customers),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Interactions by page (CTA / contact / banner / link clicks) ------------
queryRouter.get('/v1/metrics/interactions', async (req, res) => {
  const since = days(req.query.days, 30);
  try {
    const { rows } = await pool.query(
      `SELECT COALESCE(NULLIF(screen, ''), '(unknown)') AS screen,
              event_name,
              COALESCE(properties->>'cta', properties->>'label',
                       NULLIF(placement, ''), '') AS cta,
              count(*) AS clicks
         FROM events
        WHERE event_name IN ('cta_click','link_click','call_click','whatsapp_click',
                             'directions_click','email_click','ad_click')
          AND ts_server >= now() - ($1 || ' days')::interval
        GROUP BY 1, 2, 3
        ORDER BY clicks DESC`,
      [since],
    );
    res.json({ days: since, rows: rows.map((r) => ({
      screen: r.screen, event_name: r.event_name, cta: r.cta, clicks: num(r.clicks),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- User activity: list users (logged-in by mobile, else anonymous) --------
queryRouter.get('/v1/users', async (req, res) => {
  const since = days(req.query.days, 30);
  const q = String(req.query.q || '').trim();
  const params: unknown[] = [since];
  let filter = '';
  if (q) {
    params.push(`%${q}%`);
    filter = `AND (customer_mobile ILIKE $${params.length} OR anonymous_id ILIKE $${params.length})`;
  }
  try {
    const { rows } = await pool.query(
      `SELECT
         CASE WHEN customer_id IS NOT NULL THEN 'customer' ELSE 'anon' END AS kind,
         CASE WHEN customer_id IS NOT NULL THEN customer_id::text ELSE anonymous_id END AS uid,
         max(customer_mobile)        AS mobile,
         count(*)                    AS events,
         count(DISTINCT session_id)  AS sessions,
         min(ts_server)              AS first_seen,
         max(ts_server)              AS last_seen
       FROM events
       WHERE ts_server >= now() - ($1 || ' days')::interval ${filter}
       GROUP BY kind, uid
       ORDER BY last_seen DESC
       LIMIT 200`,
      params,
    );
    res.json({ days: since, rows: rows.map((r) => ({
      kind: r.kind, uid: r.uid, mobile: r.mobile || null,
      events: num(r.events), sessions: num(r.sessions),
      first_seen: r.first_seen, last_seen: r.last_seen,
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- One user's activity timeline -------------------------------------------
queryRouter.get('/v1/users/activity', async (req, res) => {
  const since = days(req.query.days, 90);
  const kind = String(req.query.kind || '');
  const uid = String(req.query.uid || '').trim();
  if (!uid) return res.status(400).json({ error: 'uid required' });
  if (kind !== 'customer' && kind !== 'anon') return res.status(400).json({ error: 'kind must be customer|anon' });
  if (kind === 'customer' && !/^\d+$/.test(uid)) return res.status(400).json({ error: 'bad customer uid' });
  const cond = kind === 'customer' ? 'customer_id = $2::bigint' : 'anonymous_id = $2';
  try {
    const { rows } = await pool.query(
      `SELECT event_name, screen, properties->>'cta' AS cta, properties->>'target' AS target,
              session_id, ts_server, customer_mobile
         FROM events
        WHERE ${cond}
          AND ts_server >= now() - ($1 || ' days')::interval
        ORDER BY ts_server DESC
        LIMIT 300`,
      [since, uid],
    );
    const mobile = rows.find((r) => r.customer_mobile)?.customer_mobile || null;
    res.json({ kind, uid, mobile, rows: rows.map((r) => ({
      event_name: r.event_name, screen: r.screen, cta: r.cta, target: r.target,
      session_id: r.session_id, ts: r.ts_server,
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Funnel / drop-off (ordered steps) --------------------------------------
// A step is one of:
//   <event_name>          e.g. booking_started   (a raw taxonomy event)
//   screen:<page>         e.g. screen:service_detail  (a screen_view of that page)
//   cta:<label>           e.g. cta:select_service     (a cta_click with that label)
// so the journey funnel can be built from pages + CTAs + events, matching the
// Pages & CTAs view. Values are validated (safe charset / taxonomy) then inlined.
// GET /v1/funnel?steps=screen:home,screen:service_detail,booking_started,order_paid&days=30
const SAFE_VALUE = /^[a-z0-9_]+$/i;
interface Step { cond: string; label: string; ev: string }
function parseFunnelStep(raw: string): Step | null {
  const s = raw.trim();
  const sep = s.indexOf(':');
  if (sep === -1) {
    if (!isEventName(s)) return null;
    return { cond: `event_name = '${s}'`, label: s, ev: s };
  }
  const kind = s.slice(0, sep).toLowerCase();
  const val = s.slice(sep + 1);
  if (!SAFE_VALUE.test(val)) return null;
  if (kind === 'screen') {
    return { cond: `event_name = 'screen_view' AND screen = '${val}'`, label: `${val} (view)`, ev: 'screen_view' };
  }
  if (kind === 'cta') {
    return { cond: `event_name = 'cta_click' AND properties->>'cta' = '${val}'`, label: `${val} (tap)`, ev: 'cta_click' };
  }
  return null;
}

queryRouter.get('/v1/funnel', async (req, res) => {
  const raw = String(req.query.steps || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (raw.length < 2 || raw.length > 12) return res.status(400).json({ error: '2..12 steps' });
  const steps = raw.map(parseFunnelStep);
  if (steps.some((s) => s === null)) {
    return res.status(400).json({ error: 'invalid step (use <event_name>, screen:<page>, or cta:<label>)' });
  }
  const parsed = steps as Step[];
  const since = days(req.query.days, 30);

  // Per session: first time each step occurred; count sessions where the step
  // happened at/after the previous step (ordered funnel).
  const firsts = parsed
    .map((s, i) => `min(ts_server) FILTER (WHERE ${s.cond}) AS t${i}`)
    .join(',\n           ');
  const reached = parsed
    .map((_, i) => {
      const conds = [`t${i} IS NOT NULL`];
      for (let k = 1; k <= i; k++) conds.push(`t${k} >= t${k - 1}`);
      return `count(*) FILTER (WHERE ${conds.join(' AND ')}) AS r${i}`;
    })
    .join(',\n           ');
  const evNames = [...new Set(parsed.map((s) => s.ev))].map((e) => `'${e}'`).join(',');

  try {
    const { rows } = await pool.query(
      `WITH s AS (
         SELECT session_id,
           ${firsts}
         FROM events
         WHERE event_name IN (${evNames})
           AND ts_server >= now() - interval '${since} days'
         GROUP BY session_id
       )
       SELECT ${reached} FROM s`,
    );
    const row = rows[0] || {};
    const base = num(row.r0); // sessions that entered the funnel (reached step 1)
    const funnel = parsed.map((s, i) => {
      const reachedN = num(row[`r${i}`]);
      return { step: s.label, spec: raw[i], index: i, reached: reachedN,
               pct: base ? Math.round((reachedN / base) * 1000) / 10 : 0 };
    });
    res.json({ days: since, entrants: base, funnel });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});
