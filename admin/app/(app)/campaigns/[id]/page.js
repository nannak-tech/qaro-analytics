import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign, getPartner, listAds } from '@/lib/controlplane';
import { getSession, isAdmin } from '@/lib/session';
import ActionForm from '@/components/ActionForm';
import StatusControl from '@/components/StatusControl';
import { createAdAction, setAdStatusAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function CampaignDetail({ params }) {
  const { id } = await params;
  const session = await getSession();
  const admin = isAdmin(session);

  const campaign = await getCampaign(id).catch(() => null);
  if (!campaign) notFound();
  if (!admin && session?.pid !== campaign.partner_id) notFound();

  const partner = await getPartner(campaign.partner_id).catch(() => null);
  const ads = await listAds(id).catch(() => []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href={`/partners/${campaign.partner_id}`} className="muted" style={{ fontSize: 13 }}>
          ← {partner?.name || 'Partner'}
        </Link>
        <h1 style={{ marginTop: 6 }}>{campaign.name}</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          <span className={`badge ${campaign.status}`}>{campaign.status}</span>
          {campaign.budget ? ` · budget ${Number(campaign.budget).toLocaleString()} AED` : ''}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, background: 'var(--panel-2)' }}>
        <div className="stat-label">campaign_id — set as AdContext.campaignId in the app</div>
        <code className="mono" style={{ fontSize: 13 }}>{campaign.id}</code>
      </div>

      <h2 style={{ fontSize: 17, margin: '8px 0 10px' }}>Ads</h2>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>New ad</div>
        <ActionForm action={createAdAction} submit="Create ad" hidden={{ campaign_id: campaign.id }}>
          <div className="grid-form">
            <div>
              <label className="stat-label label" htmlFor="a-placement">Placement</label>
              <input id="a-placement" name="placement" className="inp" placeholder="e.g. home_banner" />
            </div>
            <div>
              <label className="stat-label label" htmlFor="a-title">Title (optional)</label>
              <input id="a-title" name="title" className="inp" placeholder="Shown with the ad" />
            </div>
            <div>
              <label className="stat-label label" htmlFor="a-image">Image URL</label>
              <input id="a-image" name="image_url" className="inp" placeholder="https://…" />
            </div>
            <div>
              <label className="stat-label label" htmlFor="a-target">Target URL (optional)</label>
              <input id="a-target" name="target_url" className="inp" placeholder="Where the tap goes" />
            </div>
            <div style={{ maxWidth: 120 }}>
              <label className="stat-label label" htmlFor="a-weight">Weight</label>
              <input id="a-weight" name="weight" className="inp" type="number" min="1" defaultValue="1" />
            </div>
          </div>
        </ActionForm>
      </div>

      <div className="card">
        {ads.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No ads yet. Create one above, then put its placement + ids on the banner in the app.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Placement</th><th>Title</th><th>ad_id</th><th style={{ textAlign: 'right' }}>Weight</th><th>Status</th>
            </tr></thead>
            <tbody>
              {ads.map((a) => (
                <tr key={a.id}>
                  <td>{a.placement}</td>
                  <td className="muted">{a.title || '—'}</td>
                  <td><code className="mono">{a.id}</code></td>
                  <td style={{ textAlign: 'right' }}>{a.weight}</td>
                  <td>
                    <StatusControl action={setAdStatusAction} id={a.id} value={a.status}
                                   options={['active', 'paused', 'archived']} extra={{ campaign_id: campaign.id }} />
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
