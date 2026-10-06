import Link from 'next/link';
import { listPartners } from '@/lib/controlplane';
import ActionForm from '@/components/ActionForm';
import StatusControl from '@/components/StatusControl';
import { createPartnerAction, setPartnerStatusAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  let partners = [], error = null;
  try { partners = await listPartners(); } catch (e) { error = e.message; }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Partners</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          Garages, producers & auto partners running ads on QARO
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>New partner</div>
        <ActionForm action={createPartnerAction} submit="Create partner">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: '1 1 240px' }}>
              <label className="stat-label label" htmlFor="name">Name</label>
              <input id="name" name="name" className="inp" placeholder="e.g. Al Habtoor Motors" />
            </div>
            <div style={{ flex: '0 0 200px' }}>
              <label className="stat-label label" htmlFor="kind">Kind</label>
              <select id="kind" name="kind" className="sel" defaultValue="garage">
                <option value="garage">Garage</option>
                <option value="producer">Producer</option>
                <option value="auto_partner">Auto partner</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <b>Can’t load partners.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        {partners.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No partners yet. Create the first one above.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Partner</th><th>Kind</th><th>Status</th>
              <th style={{ textAlign: 'right' }}>Campaigns</th>
              <th style={{ textAlign: 'right' }}>Users</th>
            </tr></thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/partners/${p.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{p.name}</Link></td>
                  <td className="muted">{p.kind}</td>
                  <td>
                    <StatusControl action={setPartnerStatusAction} id={p.id} value={p.status}
                                   options={['active', 'paused', 'archived']} />
                  </td>
                  <td style={{ textAlign: 'right' }}>{p.campaigns}</td>
                  <td style={{ textAlign: 'right' }}>{p.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
