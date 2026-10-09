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

// Time window: either an explicit date range (from/to = YYYY-MM-DD, inclusive)
// or a relative `days` lookback. Dates are regex-validated and safe to inline.
// Returns a SQL condition on ts_server plus a label echoed back to the client.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Market timezone: a "single day" means that calendar day in UAE local time,
// and single-day ranges are bucketed by local hour so Today shows an hourly trend.
const TZ = 'Asia/Dubai';
function timeCond(
  req: { query: any },
  defDays: number,
): { cond: string; label: Record<string, unknown>; gran: 'hour' | 'day' } {
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || (DATE_RE.test(from) ? from : '')).trim();
  if (DATE_RE.test(from) && DATE_RE.test(to)) {
    if (from === to) {
      // One calendar day in local time → hourly granularity.
      return {
        cond: `ts_server >= ('${from}'::timestamp AT TIME ZONE '${TZ}') AND ts_server < (('${from}'::timestamp + interval '1 day') AT TIME ZONE '${TZ}')`,
        label: { from, to },
        gran: 'hour',
      };
    }
    return {
      cond: `ts_server >= '${from}'::date AND ts_server < ('${to}'::date + interval '1 day')`,
      label: { from, to },
      gran: 'day',
    };
  }
  const d = days(req.query.days, defDays);
  return { cond: `ts_server >= now() - interval '${d} days'`, label: { days: d }, gran: d <= 1 ? 'hour' : 'day' };
}

// Bucket expression + output key for the daily/trend endpoints, per granularity.
// Hourly buckets are formatted as a tz-stable string ("YYYY-MM-DDTHH:00") in
// local time so the browser renders the hour without re-applying a timezone.
function bucketExpr(gran: 'hour' | 'day'): string {
  return gran === 'hour'
    ? `to_char(date_trunc('hour', ts_server AT TIME ZONE '${TZ}'), 'YYYY-MM-DD"T"HH24:00')`
    : `date_trunc('day', ts_server)::date`;
}

export const queryRouter = Router();
queryRouter.use('/v1/metrics', requireQueryKey);
queryRouter.use('/v1/funnel', requireQueryKey);

// ---- Ad metrics: per-campaign impressions/clicks/CTR for a partner ----------
queryRouter.get('/v1/metrics/ad', async (req, res) => {
  const partnerId = String(req.query.partner_id || '');
  if (!partnerId) return res.status(400).json({ error: 'partner_id required' });
  const t = timeCond(req, 30);
  try {
    const { rows } = await pool.query(
      `SELECT campaign_id,
              count(*) FILTER (WHERE event_name = 'ad_impression') AS impressions,
              count(*) FILTER (WHERE event_name = 'ad_click')      AS clicks
         FROM events
        WHERE partner_id = $1
          AND event_name IN ('ad_impression','ad_click')
          AND ${t.cond}
        GROUP BY campaign_id
        ORDER BY impressions DESC`,
      [partnerId],
    );
    const out = rows.map((r) => {
      const imp = num(r.impressions), clk = num(r.clicks);
      return { campaign_id: r.campaign_id, impressions: imp, clicks: clk,
               ctr: imp ? Math.round((clk / imp) * 1000) / 10 : 0 };
    });
    res.json({ partner_id: partnerId, ...t.label, rows: out });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Daily event counts (top-line volumes) ----------------------------------
queryRouter.get('/v1/metrics/events', async (req, res) => {
  const t = timeCond(req, 30);
  try {
    const { rows } = await pool.query(
      `SELECT date_trunc('day', ts_server)::date AS day,
              event_name,
              count(*)                   AS events,
              count(distinct session_id) AS sessions,
              count(distinct customer_id) AS customers
         FROM events
        WHERE ${t.cond}
        GROUP BY day, event_name
        ORDER BY day`,
    );
    res.json({ ...t.label, rows: rows.map((r) => ({
      day: r.day, event_name: r.event_name,
      events: num(r.events), sessions: num(r.sessions), customers: num(r.customers),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Daily trend: events / users / sessions / views / interactions ----------
queryRouter.get('/v1/metrics/daily', async (req, res) => {
  const t = timeCond(req, 30);
  try {
    const { rows } = await pool.query(
      `SELECT ${bucketExpr(t.gran)} AS day,
              count(*)                     AS events,
              count(DISTINCT session_id)   AS sessions,
              count(DISTINCT anonymous_id) AS users,
              count(*) FILTER (WHERE event_name = 'screen_view'
                               AND screen NOT IN ('', '/', 'unknown')
                               AND screen NOT LIKE 'minified:%') AS views,
              count(*) FILTER (WHERE event_name IN ('cta_click','link_click','call_click',
                               'whatsapp_click','directions_click','email_click','ad_click')) AS interactions
         FROM events
        WHERE ${t.cond}
        GROUP BY day
        ORDER BY day`,
    );
    // Range totals (distinct over the whole range, not summable from per-day).
    const { rows: tot } = await pool.query(
      `SELECT count(*) AS events,
              count(DISTINCT anonymous_id) AS users,
              count(DISTINCT customer_id)  AS logged_in,
              count(DISTINCT session_id)   AS sessions
         FROM events WHERE ${t.cond}`,
    );
    // Busiest hour-of-day across the whole range (UAE local time).
    const { rows: bh } = await pool.query(
      `SELECT extract(hour FROM ts_server AT TIME ZONE '${TZ}')::int AS hour, count(*) AS events
         FROM events WHERE ${t.cond}
        GROUP BY hour ORDER BY events DESC, hour LIMIT 1`,
    );
    const busiest_hour = bh[0] ? { hour: num(bh[0].hour), events: num(bh[0].events) } : null;
    const total = tot[0] || {};
    res.json({ ...t.label, gran: t.gran, busiest_hour,
      total: { events: num(total.events), users: num(total.users),
               logged_in: num(total.logged_in), sessions: num(total.sessions) },
      rows: rows.map((r) => ({
        day: r.day, events: num(r.events), sessions: num(r.sessions), users: num(r.users),
        views: num(r.views), interactions: num(r.interactions),
      })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Top pages (screen_view grouped by page name) ---------------------------
queryRouter.get('/v1/metrics/screens', async (req, res) => {
  const t = timeCond(req, 30);
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
          AND ${t.cond}
        GROUP BY screen
        ORDER BY views DESC`,
    );
    res.json({ ...t.label, rows: rows.map((r) => ({
      screen: r.screen, views: num(r.views),
      sessions: num(r.sessions), customers: num(r.customers),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Interactions by page (CTA / contact / banner / link clicks) ------------
queryRouter.get('/v1/metrics/interactions', async (req, res) => {
  const t = timeCond(req, 30);
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
          AND ${t.cond}
        GROUP BY 1, 2, 3
        ORDER BY clicks DESC`,
    );
    res.json({ ...t.label, rows: rows.map((r) => ({
      screen: r.screen, event_name: r.event_name, cta: r.cta, clicks: num(r.clicks),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- User activity: list users (logged-in by mobile, else anonymous) --------
queryRouter.get('/v1/users', async (req, res) => {
  const t = timeCond(req, 30);
  const q = String(req.query.q || '').trim();
  const params: unknown[] = [];
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
       WHERE ${t.cond} ${filter}
       GROUP BY kind, uid
       ORDER BY last_seen DESC
       LIMIT 200`,
      params,
    );
    res.json({ ...t.label, rows: rows.map((r) => ({
      kind: r.kind, uid: r.uid, mobile: r.mobile || null,
      events: num(r.events), sessions: num(r.sessions),
      first_seen: r.first_seen, last_seen: r.last_seen,
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Daily users trend (for the chart) --------------------------------------
queryRouter.get('/v1/users/daily', async (req, res) => {
  const t = timeCond(req, 30);
  try {
    const { rows } = await pool.query(
      `SELECT ${bucketExpr(t.gran)} AS day,
              count(DISTINCT anonymous_id) AS users,
              count(DISTINCT customer_id)  AS logged_in,
              count(DISTINCT session_id)   AS sessions
         FROM events
        WHERE ${t.cond}
        GROUP BY day
        ORDER BY day`,
    );
    res.json({ ...t.label, gran: t.gran, rows: rows.map((r) => ({
      day: r.day, users: num(r.users), logged_in: num(r.logged_in), sessions: num(r.sessions),
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- One user's activity timeline -------------------------------------------
queryRouter.get('/v1/users/activity', async (req, res) => {
  const t = timeCond(req, 90);
  const kind = String(req.query.kind || '');
  const uid = String(req.query.uid || '').trim();
  if (!uid) return res.status(400).json({ error: 'uid required' });
  if (kind !== 'customer' && kind !== 'anon') return res.status(400).json({ error: 'kind must be customer|anon' });
  if (kind === 'customer' && !/^\d+$/.test(uid)) return res.status(400).json({ error: 'bad customer uid' });
  const est = String(req.query.est || '').trim();
  const cond = kind === 'customer' ? 'customer_id = $1::bigint' : 'anonymous_id = $1';
  const params: unknown[] = [uid];
  let estFilter = '';
  if (est) { params.push(est); estFilter = `AND properties->>'establishment_id' = $${params.length}`; }
  try {
    const { rows } = await pool.query(
      `SELECT event_name, screen, properties->>'cta' AS cta, properties->>'target' AS target,
              properties->>'establishment_name' AS establishment,
              session_id, ts_server, customer_mobile
         FROM events
        WHERE ${cond}
          AND ${t.cond} ${estFilter}
        ORDER BY ts_server DESC
        LIMIT 300`,
      params,
    );
    const mobile = rows.find((r) => r.customer_mobile)?.customer_mobile || null;
    const establishment = rows.find((r) => r.establishment)?.establishment || null;
    res.json({ kind, uid, mobile, establishment, rows: rows.map((r) => ({
      event_name: r.event_name, screen: r.screen, cta: r.cta, target: r.target,
      establishment: r.establishment, session_id: r.session_id, ts: r.ts_server,
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Establishments: list partners/garages seen in events -------------------
const EST_ACTIVITY = `event_name IN ('call_click','whatsapp_click','directions_click',
  'email_click','cta_click','booking_started','slot_selected','order_placed','order_paid','order_cancelled')`;

queryRouter.get('/v1/establishments', async (req, res) => {
  const t = timeCond(req, 30);
  try {
    const { rows } = await pool.query(
      `SELECT properties->>'establishment_id' AS id,
              max(properties->>'establishment_name') AS name,
              count(*) FILTER (WHERE event_name = 'screen_view' AND screen = 'provider_detail') AS views,
              count(*) FILTER (WHERE ${EST_ACTIVITY}) AS activities,
              count(DISTINCT COALESCE(customer_id::text, anonymous_id)) AS users,
              count(DISTINCT customer_id) AS logged_in,
              max(ts_server) AS last_seen
         FROM events
        WHERE properties->>'establishment_id' IS NOT NULL
          AND properties->>'establishment_id' <> ''
          AND ${t.cond}
        GROUP BY id
        ORDER BY activities DESC, views DESC
        LIMIT 200`,
    );
    res.json({ ...t.label, rows: rows.map((r) => ({
      id: r.id, name: r.name || null, views: num(r.views), activities: num(r.activities),
      users: num(r.users), logged_in: num(r.logged_in), last_seen: r.last_seen,
    })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- One establishment: page views + activity breakdown + customers ---------
queryRouter.get('/v1/establishments/activity', async (req, res) => {
  const id = String(req.query.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });
  const t = timeCond(req, 30);
  try {
    const [breakdown, customers, meta] = await Promise.all([
      pool.query(
        `SELECT event_name,
                COALESCE(properties->>'cta', '') AS cta,
                count(*) AS count,
                count(DISTINCT COALESCE(customer_id::text, anonymous_id)) AS users
           FROM events
          WHERE properties->>'establishment_id' = $1 AND ${t.cond}
          GROUP BY event_name, cta
          ORDER BY count DESC`,
        [id],
      ),
      pool.query(
        `SELECT CASE WHEN customer_id IS NOT NULL THEN 'customer' ELSE 'anon' END AS kind,
                CASE WHEN customer_id IS NOT NULL THEN customer_id::text ELSE anonymous_id END AS uid,
                max(customer_mobile) AS mobile,
                count(*) AS events,
                max(ts_server) AS last_seen
           FROM events
          WHERE properties->>'establishment_id' = $1 AND ${t.cond}
          GROUP BY kind, uid
          ORDER BY last_seen DESC
          LIMIT 100`,
        [id],
      ),
      pool.query(
        `SELECT max(properties->>'establishment_name') AS name,
                count(*) FILTER (WHERE event_name = 'screen_view' AND screen = 'provider_detail') AS views
           FROM events WHERE properties->>'establishment_id' = $1 AND ${t.cond}`,
        [id],
      ),
    ]);
    const m = meta.rows[0] || {};
    res.json({
      id, name: m.name || null, views: num(m.views),
      activities: breakdown.rows.map((r) => ({
        event_name: r.event_name, cta: r.cta, count: num(r.count), users: num(r.users),
      })),
      customers: customers.rows.map((r) => ({
        kind: r.kind, uid: r.uid, mobile: r.mobile || null, events: num(r.events), last_seen: r.last_seen,
      })),
    });
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
  // screenlike:<val> matches any screen CONTAINING <val>, e.g. screenlike:listing
  // catches car_wash_listing, cleaning_listing, … as one "service listing" step.
  if (kind === 'screenlike') {
    return { cond: `event_name = 'screen_view' AND screen LIKE '%${val}%'`, label: `${val} (view)`, ev: 'screen_view' };
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
  const t = timeCond(req, 30);

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
           AND ${t.cond}
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
    res.json({ ...t.label, entrants: base, funnel });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});
