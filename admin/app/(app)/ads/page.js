import { getAdMetrics } from '@/lib/ingest';
import { listPartners, getPartner } from '@/lib/controlplane';
import { getSession, isAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AdsPage({ searchParams }) {
  const sp = await searchParams;
  const days = Number(sp?.days) || 30;
  const session = await getSession();
  const admin = isAdmin(session);

  // Partner users are locked to their own partner; admins pick one.
  const partnerId = admin ? (sp?.partner_id || '') : (session?.pid || '');

  const partners = admin ? await listPartners().catch(() => []) : [];
  const partner = partnerId ? await getPartner(partnerId).catch(() => null) : null;

  let data = null, error = null;
  if (partnerId) {
    try { data = await getAdMetrics(partnerId, days); } catch (e) { error = e.message; }
  }

  const rows = data?.rows ?? [];
  const totalImp = rows.reduce((a, r) => a + r.impressions, 0);
  const totalClk = rows.reduce((a, r) => a + r.clicks, 0);
  const ctr = totalImp ? Math.round((totalClk / totalImp) * 1000) / 10 : 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Ad metrics</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Impressions, clicks & CTR per campaign{partner ? ` · ${partner.name}` : ''} · last {days} days
        </div>
      </div>

      {admin && (
        <form method="GET" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1 1 260px', maxWidth: 340 }}>
            <label className="stat-label label" htmlFor="partner">Partner</label>
            <select id="partner" name="partner_id" className="sel" defaultValue={partnerId}>
              <option value="">Select a partner…</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 120px' }}>
            <label className="stat-label label" htmlFor="days">Window</label>
            <select id="days" name="days" className="sel" defaultValue={String(days)}>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          <button type="submit" className="btn">View</button>
        </form>
      )}

      {!partnerId && (
        <div className="card muted">
          {admin ? 'Pick a partner to see their campaign performance.' : 'No partner is linked to your account yet.'}
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load ad metrics.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
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
