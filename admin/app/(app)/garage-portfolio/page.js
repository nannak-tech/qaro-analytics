import { getGaragePortfolio } from '@/lib/ingest';
import GarageRow from '@/components/GarageRow';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel } from '@/lib/range';

export const dynamic = 'force-dynamic';

// The qaro.ae garage portfolio funnel. Events emitted by the marketing site
// (lib/garages, garage-listing, garage-theme) carry properties.establishment_id,
// so each claimed garage's path rolls up: profile view → claim opened → form
// filled → submitted → paid. Brand-new listings (no claim, no establishment_id)
// are summed into the header totals but not the per-garage table.
export default async function GaragePortfolioPage({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);

  let rows = [], newGarage = { submitted: 0, paid: 0 }, error = null;
  try {
    const d = await getGaragePortfolio(range);
    rows = d.rows || [];
    newGarage = d.new_garage || newGarage;
  } catch (e) { error = e.message; }

  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totalViews = sum('views');
  const totalClaims = sum('claims');
  const totalSubmitted = sum('submitted') + newGarage.submitted;
  const totalPaid = sum('paid') + newGarage.paid;

  const stat = (label, value, note) => (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value.toLocaleString()}</div>
      {note ? <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{note}</div> : null}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>Garage portfolio</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            The qaro.ae listing funnel per garage: profile view → claim → form → paid · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
        {stat('Garages', rows.length)}
        {stat('Profile views', totalViews)}
        {stat('Claims opened', totalClaims)}
        {stat('Listings submitted', totalSubmitted, newGarage.submitted ? `${newGarage.submitted} new, no claim` : null)}
        {stat('Paid', totalPaid, newGarage.paid ? `${newGarage.paid} new, no claim` : null)}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <b>Can’t load the garage portfolio.</b>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>
            No garage funnel activity in this range. Needs the qaro.ae web tracking deployed and <span className="mono">ANALYTICS_APP_KEY</span> set.
          </div>
        ) : (
          <table>
            <thead><tr>
              <th>Garage</th>
              <th style={{ textAlign: 'right' }}>Profile views</th>
              <th style={{ textAlign: 'right' }}>Claims</th>
              <th style={{ textAlign: 'right' }}>Form started</th>
              <th style={{ textAlign: 'right' }}>Submitted</th>
              <th style={{ textAlign: 'right' }}>Paid</th>
              <th style={{ textAlign: 'right' }}>People</th>
              <th>Last seen</th>
            </tr></thead>
            <tbody>
              {rows.map((g) => <GarageRow key={g.id} g={g} range={range} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
