import { getEstablishments } from '@/lib/ingest';
import EstRow from '@/components/EstRow';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel } from '@/lib/range';

export const dynamic = 'force-dynamic';

export default async function EstablishmentsPage({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);

  let rows = [], error = null;
  try { ({ rows } = await getEstablishments(range)); } catch (e) { error = e.message; }

  const totalViews = rows.reduce((a, r) => a + r.views, 0);
  const totalActs = rows.reduce((a, r) => a + r.activities, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Establishments</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Garages / partners customers viewed & interacted with · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Establishments</div><div className="stat-value">{rows.length}</div></div>
        <div className="card"><div className="stat-label">Page views</div><div className="stat-value">{totalViews.toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Activities</div><div className="stat-value">{totalActs.toLocaleString()}</div></div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <b>Can’t load establishments.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>
            No establishment activity yet. (Needs the establishment-tagged build shipped in the app.)
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Establishment</th>
              <th style={{ textAlign: 'right' }}>Page views</th>
              <th style={{ textAlign: 'right' }}>Activities</th>
              <th style={{ textAlign: 'right' }}>Customers</th>
              <th>Last seen</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => <EstRow key={r.id} est={r} range={range} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
