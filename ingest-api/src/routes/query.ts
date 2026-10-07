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
          AND screen IS NOT NULL AND screen <> ''
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

// ---- Funnel / drop-off (ordered steps) --------------------------------------
// GET /v1/funnel?steps=booking_started,slot_selected,payment_started,order_paid&days=30
queryRouter.get('/v1/funnel', async (req, res) => {
  const steps = String(req.query.steps || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (steps.length < 2 || steps.length > 10) return res.status(400).json({ error: '2..10 steps' });
  if (!steps.every(isEventName)) return res.status(400).json({ error: 'all steps must be known event_names' });
  const since = days(req.query.days, 30);

  // Step names are validated against the closed taxonomy → safe to inline.
  // Per session: first time each step occurred; count sessions where the step
  // happened at/after the previous step (ordered funnel).
  const firsts = steps
    .map((s, i) => `min(ts_server) FILTER (WHERE event_name = '${s}') AS t${i}`)
    .join(',\n           ');
  const reached = steps
    .map((_, i) => {
      const conds = [`t${i} IS NOT NULL`];
      for (let k = 1; k <= i; k++) conds.push(`t${k} >= t${k - 1}`);
      return `count(*) FILTER (WHERE ${conds.join(' AND ')}) AS r${i}`;
    })
    .join(',\n           ');
  const names = steps.map((s) => `'${s}'`).join(',');

  try {
    const { rows } = await pool.query(
      `WITH s AS (
         SELECT session_id,
           ${firsts}
         FROM events
         WHERE event_name IN (${names})
           AND ts_server >= now() - interval '${since} days'
         GROUP BY session_id
       )
       SELECT ${reached} FROM s`,
    );
    const row = rows[0] || {};
    const base = num(row.r0); // sessions that entered the funnel (reached step 1)
    const funnel = steps.map((name, i) => {
      const reachedN = num(row[`r${i}`]);
      return { step: name, index: i, reached: reachedN,
               pct: base ? Math.round((reachedN / base) * 1000) / 10 : 0 };
    });
    res.json({ days: since, entrants: base, funnel });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});
