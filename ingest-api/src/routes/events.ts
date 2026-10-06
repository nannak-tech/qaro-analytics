import { Router, type Request, type Response } from 'express';
import { resolveAppKey } from '../auth.js';
import { validateEvent, type IngestContext } from '../validate.js';
import { insertEvents, type EventRow } from '../pg.js';

const MAX_BATCH = Number(process.env.MAX_BATCH || 500);

// Best-effort geo from IP. Stubbed to empty for now; wire a MaxMind/GeoLite
// lookup here later. The raw IP is used only here and never stored.
function geoFromIp(_ip: string): { country: string; city: string } {
  return { country: '', city: '' };
}

function clientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string) || '';
  return xff.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export const eventsRouter = Router();

eventsRouter.post('/v1/events', async (req: Request, res: Response) => {
  const appName = await resolveAppKey(req.header('x-qaro-app-key') || undefined);
  if (!appName) return res.status(401).json({ error: 'invalid or missing app key' });

  const body = req.body;
  const events: unknown[] = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) return res.status(400).json({ error: 'no events' });
  if (events.length > MAX_BATCH) return res.status(413).json({ error: `batch > ${MAX_BATCH}` });

  const geo = geoFromIp(clientIp(req));
  const ctx: IngestContext = {
    appName,
    tsServer: new Date(),
    geoCountry: geo.country,
    geoCity: geo.city,
  };

  const rows: EventRow[] = [];
  const errors: { index: number; error: string }[] = [];
  events.forEach((raw, i) => {
    const r = validateEvent(raw, ctx);
    if (r.ok) rows.push(r.row);
    else errors.push({ index: i, error: r.error });
  });

  try {
    await insertEvents(rows);
  } catch (e: any) {
    // Ingestion failed — tell the client to retry the whole batch (offline
    // buffer will replay; event_id dedupe keeps it idempotent).
    return res.status(503).json({ error: 'store unavailable', detail: e?.message });
  }

  return res.status(202).json({ accepted: rows.length, rejected: errors.length, errors });
});
