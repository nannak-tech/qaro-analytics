import express from 'express';
import { eventsRouter } from './routes/events.js';
import { queryRouter } from './routes/query.js';
import { controlRouter } from './routes/control.js';
import { pingPostgres } from './pg.js';
import { ensureAdminUser } from './accounts.js';

const app = express();
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
