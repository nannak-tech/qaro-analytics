import { getAdMetrics } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

export default async function AdsPage({ searchParams }) {
  const sp = await searchParams;
  const days = Number(sp?.days) || 30;
  const partnerId = sp?.partner_id || '';

  let data = null, error = null;
  if (partnerId) {
    try {
      data = await getAdMetrics(partnerId, days);
    } catch (e) {
      error = e.message;
    }
  }

  const rows = data?.rows ?? [];
  const totalImp = rows.reduce((a, r) => a + r.impressions, 0);
  const totalClk = rows.reduce((a, r) => a + r.clicks, 0);
  const ctr = totalImp ? Math.round((totalClk / totalImp) * 1000) / 10 : 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Ad metrics</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Impressions, clicks & CTR per campaign · last {days} days
        </div>
      </div>

      {/* Partner picker — campaigns are partner-scoped. */}
      <form method="GET" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          name="partner_id"
          defaultValue={partnerId}
          placeholder="partner_id"
          style={{
            flex: '1 1 240px', maxWidth: 320, padding: '9px 12px', borderRadius: 9,
            background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)',
          }}
        />
        <input type="hidden" name="days" value={days} />
        <button type="submit"
          style={{
            padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)',
            background: 'var(--brand)', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}>View</button>
      </form>

      {!partnerId && (
        <div className="card muted">Enter a <code>partner_id</code> to see that partner’s campaign performance.</div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load ad metrics.</b>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      {partnerId && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <div className="card"><div className="stat-label">Impressions</div><div className="stat-value">{totalImp.toLocaleString()}</div></div>
            <div className="card"><div className="stat-label">Clicks</div><div className="stat-value">{totalClk.toLocaleString()}</div></div>
            <div className="card"><div className="stat-label">CTR</div><div className="stat-value">{ctr}%</div></div>
          </div>

          <div className="card">
            <div style={{ marginBottom: 6, fontWeight: 600 }}>Campaigns</div>
            {rows.length === 0 ? (
              <div className="muted" style={{ padding: 16 }}>No ad events for this partner in the window.</div>
            ) : (
              <table>
                <thead><tr>
                  <th>Campaign</th>
                  <th style={{ textAlign: 'right' }}>Impressions</th>
                  <th style={{ textAlign: 'right' }}>Clicks</th>
                  <th style={{ textAlign: 'right' }}>CTR</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.campaign_id || '—'}>
                      <td>{r.campaign_id || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{r.impressions.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{r.clicks.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="muted">{r.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
