import { getEventCounts } from '@/lib/ingest';
import { TimeSeries } from '@/components/Charts';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel } from '@/lib/range';

export const dynamic = 'force-dynamic';

function Stat({ label, value }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default async function OverviewPage({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);

  let data = null, error = null;
  try {
    data = await getEventCounts(range);
  } catch (e) {
    error = e.message;
  }

  const rows = data?.rows ?? [];

  // Total events per day (for the time series).
  const byDay = new Map();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) || 0) + r.events);
  const series = [...byDay.entries()].map(([day, value]) => ({ day, value }));

  // Totals + per-event breakdown.
  const totalEvents = rows.reduce((a, r) => a + r.events, 0);
  const byEvent = new Map();
  for (const r of rows) {
    const e = byEvent.get(r.event_name) || { events: 0 };
    e.events += r.events;
    byEvent.set(r.event_name, e);
  }
  const events = [...byEvent.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.events - a.events);

  const busiest = series.reduce((m, p) => (p.value > (m?.value ?? -1) ? p : m), null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Overview</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{rangeLabel(range)}</div>
        </div>
        <RangeControls />
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t reach the ingest API.</b>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Total events" value={totalEvents.toLocaleString()} />
        <Stat label="Event types" value={events.length} />
        <Stat label="Days with data" value={series.length} />
        <Stat label="Busiest day" value={busiest ? busiest.value.toLocaleString() : '—'} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 10, fontWeight: 600 }}>Event volume</div>
        <TimeSeries data={series} />
      </div>

      <div className="card">
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Events by type</div>
        {events.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No events in this window.</div>
        ) : (
          <table>
            <thead><tr><th>Event</th><th style={{ textAlign: 'right' }}>Count</th><th style={{ textAlign: 'right' }}>Share</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td style={{ textAlign: 'right' }}>{e.events.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }} className="muted">
                    {totalEvents ? Math.round((e.events / totalEvents) * 1000) / 10 : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

