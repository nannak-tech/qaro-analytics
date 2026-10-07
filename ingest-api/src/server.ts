import express from 'express';
import { eventsRouter } from './routes/events.js';
import { queryRouter } from './routes/query.js';
import { controlRouter } from './routes/control.js';
import { pingPostgres } from './pg.js';
import { ensureAdminUser } from './accounts.js';

const app = express();

// CORS — the Flutter *web* build posts events cross-origin (app.qaro.ae ->
// analytics.qaro.ae) and the browser preflights it. Native apps aren't affected.
// Allowlist via CORS_ORIGINS (comma-separated); defaults to the prod web app.
const corsOrigins = new Set(
  (process.env.CORS_ORIGINS || 'https://app.qaro.ae')
    .split(',').map((s) => s.trim()).filter(Boolean),
);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QARO-App-Key, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  const postgres = await pingPostgres();
  res.status(postgres ? 200 : 503).json({
    status: postgres ? 'ok' : 'degraded',
    service: 'qaro-analytics-ingest',
    postgres,
  });
});

app.use(eventsRouter);
app.use(queryRouter);
app.use(controlRouter);

const port = Number(process.env.PORT || 4100);
app.listen(port, async () => {
  console.log(`[ingest] listening on :${port}`);
  // Bootstrap the first qaro_admin so the dashboard is reachable on a fresh DB.
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    try { await ensureAdminUser(email, password); }
    catch (e: any) { console.warn('[ingest] admin bootstrap skipped:', e?.message); }
  }
});
