import express from 'express';
import { eventsRouter } from './routes/events.js';
import { queryRouter } from './routes/query.js';
import { pingPostgres } from './pg.js';

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

const port = Number(process.env.PORT || 4100);
app.listen(port, () => console.log(`[ingest] listening on :${port}`));
