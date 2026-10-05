import express from 'express';
import { eventsRouter } from './routes/events.js';
import { queryRouter } from './routes/query.js';
import { pingClickHouse } from './clickhouse.js';
import { pingPostgres } from './pg.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', async (_req, res) => {
  const [clickhouse, postgres] = await Promise.all([pingClickHouse(), pingPostgres()]);
  res.json({ status: 'ok', service: 'qaro-analytics-ingest', clickhouse, postgres });
});

app.use(eventsRouter);
app.use(queryRouter);

const port = Number(process.env.PORT || 4100);
app.listen(port, () => console.log(`[ingest] listening on :${port}`));
