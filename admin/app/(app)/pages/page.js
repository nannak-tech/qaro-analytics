import { getScreens, getInteractions, getDaily } from '@/lib/ingest';
import { DailyTrend } from '@/components/Charts';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel } from '@/lib/range';

export const dynamic = 'force-dynamic';

// Friendly labels for the interaction event names.
const ACTION = {
  cta_click: 'CTA',
  link_click: 'Link',
  call_click: 'Call',
  whatsapp_click: 'WhatsApp',
  directions_click: 'Directions',
  email_click: 'Email',
  ad_click: 'Banner',
};

export default async function PagesView({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);

  let screens = [], interactions = [], daily = [], error = null;
  try {
    [{ rows: screens }, { rows: interactions }, { rows: daily }] = await Promise.all([
      getScreens(range), getInteractions(range), getDaily(range),
    ]);
  } catch (e) { error = e.message; }

  const totalViews = screens.reduce((a, r) => a + r.views, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Pages & interactions</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Views per page and the CTAs / links / banners tapped on each · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load page metrics.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Daily trend</div>
        <DailyTrend data={daily} lines={[
          { key: 'views', name: 'Page views', color: 'var(--brand)' },
          { key: 'interactions', name: 'Interactions', color: 'var(--brand-2)' },
        ]} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Top pages</div>
        {screens.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No page views yet. (Screens need the named-screen tracking shipped in the app.)</div>
        ) : (
          <table>
            <thead><tr>
              <th>Page</th>
              <th style={{ textAlign: 'right' }}>Views</th>
              <th style={{ textAlign: 'right' }}>Sessions</th>
              <th style={{ textAlign: 'right' }}>Share</th>
            </tr></thead>
            <tbody>
              {screens.map((r) => (
                <tr key={r.screen}>
                  <td style={{ fontWeight: 600 }}>{r.screen}</td>
                  <td style={{ textAlign: 'right' }}>{r.views.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{r.sessions.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }} className="muted">
                    {totalViews ? Math.round((r.views / totalViews) * 1000) / 10 : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Interactions by page</div>
        {interactions.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No CTA / link / banner clicks yet.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Page</th><th>Action</th><th>Label</th>
              <th style={{ textAlign: 'right' }}>Clicks</th>
            </tr></thead>
            <tbody>
              {interactions.map((r, i) => (
                <tr key={`${r.screen}-${r.event_name}-${r.cta}-${i}`}>
                  <td>{r.screen}</td>
                  <td><span className="badge">{ACTION[r.event_name] || r.event_name}</span></td>
                  <td className="muted">{r.cta || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.clicks.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
