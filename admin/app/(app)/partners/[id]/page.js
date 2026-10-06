import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPartner, listCampaigns, listInvites } from '@/lib/controlplane';
import { getSession, isAdmin } from '@/lib/session';
import ActionForm from '@/components/ActionForm';
import InviteForm from '@/components/InviteForm';
import StatusControl from '@/components/StatusControl';
import { createCampaignAction, setCampaignStatusAction, createInviteAction } from '../../actions';

export const dynamic = 'force-dynamic';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default async function PartnerDetail({ params }) {
  const { id } = await params;
  const session = await getSession();
  const admin = isAdmin(session);

  // Defense in depth (middleware already scopes partner users).
  if (!admin && session?.pid !== id) notFound();

  const partner = await getPartner(id).catch(() => null);
  if (!partner) notFound();

  const campaigns = await listCampaigns(id).catch(() => []);
  const canInvite = admin || session?.role === 'partner_admin';
  const invites = canInvite ? await listInvites(id).catch(() => []) : [];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
        <div>
          {admin && <Link href="/partners" className="muted" style={{ fontSize: 13 }}>← All partners</Link>}
          <h1 style={{ marginTop: 6 }}>{partner.name}</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {partner.kind} · <span className={`badge ${partner.status}`}>{partner.status}</span>
          </div>
        </div>
        <Link href={`/ads?partner_id=${partner.id}`} className="btn" style={{ textDecoration: 'none' }}>
          View ad metrics →
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 20, background: 'var(--panel-2)' }}>
        <div className="stat-label">partner_id — use this in the app’s AdContext</div>
        <code className="mono" style={{ fontSize: 13 }}>{partner.id}</code>
      </div>

      {/* Campaigns */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 10px' }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Campaigns</h2>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>New campaign</div>
        <ActionForm action={createCampaignAction} submit="Create campaign" hidden={{ partner_id: partner.id }}>
          <div className="grid-form">
            <div>
              <label className="stat-label label" htmlFor="c-name">Name</label>
              <input id="c-name" name="name" className="inp" placeholder="e.g. Ramadan Service Offer" />
            </div>
            <div>
              <label className="stat-label label" htmlFor="c-status">Status</label>
              <select id="c-status" name="status" className="sel" defaultValue="active">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div>
              <label className="stat-label label" htmlFor="c-budget">Budget (AED, optional)</label>
              <input id="c-budget" name="budget" className="inp" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="stat-label label" htmlFor="c-start">Starts</label>
                <input id="c-start" name="starts_at" className="inp" type="date" />
              </div>
              <div style={{ flex: 1 }}>
                <label className="stat-label label" htmlFor="c-end">Ends</label>
                <input id="c-end" name="ends_at" className="inp" type="date" />
              </div>
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card" style={{ marginBottom: 28 }}>
        {campaigns.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No campaigns yet.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Campaign</th><th>Status</th>
              <th style={{ textAlign: 'right' }}>Ads</th>
              <th style={{ textAlign: 'right' }}>Budget</th>
              <th>Window</th>
            </tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/campaigns/${c.id}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{c.name}</Link></td>
                  <td>
                    <StatusControl action={setCampaignStatusAction} id={c.id} value={c.status}
                                   options={['draft', 'active', 'paused', 'ended']} />
                  </td>
                  <td style={{ textAlign: 'right' }}>{c.ads}</td>
                  <td style={{ textAlign: 'right' }}>{c.budget ? Number(c.budget).toLocaleString() : '—'}</td>
                  <td className="muted">{fmtDate(c.starts_at)} – {fmtDate(c.ends_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Team / invites */}
      {canInvite && (
        <>
          <h2 style={{ fontSize: 17, margin: '8px 0 10px' }}>Team access</h2>
          <div className="card" style={{ marginBottom: 14 }}>
            <InviteForm action={createInviteAction} partnerId={partner.id} />
          </div>
          <div className="card">
            {invites.length === 0 ? (
              <div className="muted" style={{ padding: 16 }}>No invites yet.</div>
            ) : (
              <table>
                <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th></tr></thead>
                <tbody>
                  {invites.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td className="muted">{i.role}</td>
                      <td>{i.accepted_at ? <span className="badge active">accepted</span>
                                          : new Date(i.expires_at) < new Date() ? <span className="badge">expired</span>
                                          : <span className="badge draft">pending</span>}</td>
                      <td className="muted">{fmtDate(i.expires_at)}</td>
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
