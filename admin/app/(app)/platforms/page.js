import { getPlatforms } from '@/lib/ingest';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel } from '@/lib/range';

export const dynamic = 'force-dynamic';

// Fixed display order so the table reads native → web → desktop.
const ORDER = [
  'Android (app)', 'iOS (app)',
  'Web app - iOS', 'Web app - Android',
  'Desktop - Windows', 'Desktop - macOS',
  'Web - Linux', 'Web - other', 'Unknown',
];

export default async function PlatformsView({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);

  let rows = [], total = null, error = null;
  try { ({ rows, total } = await getPlatforms(range)); }
  catch (e) { error = e.message; }

  rows = [...rows].sort((a, b) => {
    const ia = ORDER.indexOf(a.bucket), ib = ORDER.indexOf(b.bucket);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // Unique people (de-duped), matching the Overview page. Not summable from the
  // per-platform rows — a person who uses two platforms counts once here but in
  // each platform's row.
  const totUsers = total?.users ?? 0;
  const totSessions = total?.sessions ?? rows.reduce((a, r) => a + r.sessions, 0);
  const max = Math.max(1, ...rows.map((r) => r.sessions));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Platforms</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Users and sessions by device platform · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load platform split.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Users</div><div className="stat-value">{totUsers.toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Sessions</div><div className="stat-value">{totSessions.toLocaleString()}</div></div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Split by platform</div>
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No data in this range.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Platform</th>
              <th style={{ textAlign: 'right' }}>Users</th>
              <th style={{ textAlign: 'right' }}>Logged-in</th>
              <th style={{ textAlign: 'right' }}>Sessions</th>
              <th style={{ width: '32%' }}>Share of sessions</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bucket}>
                  <td style={{ fontWeight: 600 }}>{r.bucket}</td>
                  <td style={{ textAlign: 'right' }}>{r.users.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }} className="muted">{r.logged_in.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{r.sessions.toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 10, background: 'var(--panel-2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${(r.sessions / max) * 100}%`, height: '100%', background: 'var(--brand)', borderRadius: 6 }} />
                      </div>
                      <span className="muted" style={{ fontSize: 12, minWidth: 38, textAlign: 'right' }}>
                        {totSessions ? Math.round((r.sessions / totSessions) * 1000) / 10 : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
          “Users” = unique people (a logged-in customer counted once, everyone else by device). Each person is counted on
          their primary platform (where they have the most sessions), so Users and Logged-in add up to the totals above.
          “Logged-in” is a subset of Users.
          <br />Web OS (iOS / Android / Windows / macOS) is captured from build 34 on; earlier web sessions show as “Web - other”.
        </div>
      </div>
    </div>
  );
}
