import { Router, type Request, type Response, type NextFunction } from 'express';
import { ch } from '../clickhouse.js';
import { isEventName } from '../taxonomy.js';

// Internal guard for query endpoints. The admin portal proxies to these with
// INTERNAL_QUERY_KEY; partner-scoping (partner_id from the session) is enforced
// by the admin layer in Phase 2. Never expose these directly to partners.
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

export const queryRouter = Router();
queryRouter.use('/v1/metrics', requireQueryKey);
queryRouter.use('/v1/funnel', requireQueryKey);

// ---- Ad metrics: per-campaign impressions/clicks/CTR for a partner ----------
queryRouter.get('/v1/metrics/ad', async (req, res) => {
  const partnerId = String(req.query.partner_id || '');
  if (!partnerId) return res.status(400).json({ error: 'partner_id required' });
  const since = days(req.query.days, 30);
  try {
    const rs = await ch.query({
      query: `
        SELECT campaign_id,
               uniqExactMerge(impressions) AS impressions,
               uniqExactMerge(clicks)      AS clicks,
               round(clicks / nullIf(impressions, 0) * 100, 2) AS ctr
        FROM ad_metrics_daily
        WHERE partner_id = {pid:String} AND day >= today() - {d:UInt16}
        GROUP BY campaign_id
        ORDER BY impressions DESC`,
      query_params: { pid: partnerId, d: since },
      format: 'JSONEachRow',
    });
    res.json({ partner_id: partnerId, days: since, rows: await rs.json() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Daily event counts (top-line volumes) ----------------------------------
queryRouter.get('/v1/metrics/events', async (req, res) => {
  const since = days(req.query.days, 30);
  try {
    const rs = await ch.query({
      query: `
        SELECT day, event_name,
               countMerge(events)    AS events,
               uniqMerge(sessions)   AS sessions,
               uniqMerge(customers)  AS customers
        FROM event_counts_daily
        WHERE day >= today() - {d:UInt16}
        GROUP BY day, event_name
        ORDER BY day`,
      query_params: { d: since },
      format: 'JSONEachRow',
    });
    res.json({ days: since, rows: await rs.json() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ---- Funnel / drop-off (ClickHouse windowFunnel) ----------------------------
// GET /v1/funnel?steps=booking_started,slot_selected,payment_started,order_paid&days=30
queryRouter.get('/v1/funnel', async (req, res) => {
  const steps = String(req.query.steps || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (steps.length < 2 || steps.length > 10) return res.status(400).json({ error: '2..10 steps' });
  if (!steps.every(isEventName)) return res.status(400).json({ error: 'all steps must be known event_names' });
  const since = days(req.query.days, 30);
  const windowSec = 7 * 24 * 3600; // a step counts if it follows within 7 days

  // Step names are validated against the taxonomy above → safe to inline.
  const conds = steps.map((s) => `event_name = '${s}'`).join(', ');
  try {
    const rs = await ch.query({
      query: `
        SELECT level, count() AS sessions FROM (
          SELECT session_id, windowFunnel({w:UInt32})(ts_server, ${conds}) AS level
          FROM events
          WHERE event_name IN ({names:Array(String)}) AND ts_server >= now() - {d:UInt32}
          GROUP BY session_id
        )
        GROUP BY level ORDER BY level`,
      query_params: { w: windowSec, names: steps, d: since * 24 * 3600 },
      format: 'JSONEachRow',
    });
    const levels = (await rs.json()) as { level: number; sessions: string }[];
    // Convert "reached exactly level N" → cumulative "reached step i or further".
    const byLevel = new Map(levels.map((r) => [Number(r.level), Number(r.sessions)]));
    const total = [...byLevel.values()].reduce((a, b) => a + b, 0);
    const funnel = steps.map((name, i) => {
      let reached = 0;
      for (const [lvl, n] of byLevel) if (lvl >= i + 1) reached += n;
      return { step: name, index: i, reached, pct: total ? Math.round((reached / total) * 1000) / 10 : 0 };
    });
    res.json({ days: since, total_sessions: total, funnel });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});
