import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserActivity } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return '—'; }
};

// Friendly label per event row.
function describe(e) {
  if (e.event_name === 'screen_view') return { action: 'Viewed', what: e.screen || '(page)' };
  if (e.event_name === 'cta_click') return { action: 'Tapped', what: e.cta + (e.target ? ` · ${e.target}` : '') };
  if (e.event_name.endsWith('_click')) return { action: 'Tapped', what: e.event_name.replace('_click', '') + (e.screen ? ` · on ${e.screen}` : '') };
  return { action: e.event_name, what: e.screen || (e.target || '') };
}

export default async function UserActivity({ params, searchParams }) {
  const { kind, uid } = await params;
  const sp = await searchParams;
  const days = Number(sp?.days) || 90;
  if (kind !== 'customer' && kind !== 'anon') notFound();

  let data = null, error = null;
  try { data = await getUserActivity(kind, decodeURIComponent(uid), days); }
  catch (e) { error = e.message; }

  const rows = data?.rows ?? [];
  const title = kind === 'customer' ? (data?.mobile || `customer #${uid}`) : uid;
  const sessions = new Set(rows.map((r) => r.session_id)).size;

  return (
    <div>
      <Link href="/users" className="muted" style={{ fontSize: 13 }}>← All users</Link>
      <div style={{ margin: '6px 0 20px' }}>
        <h1 style={{ display: 'inline-block', marginRight: 10 }}>{title}</h1>
        {kind === 'customer'
          ? <span className="badge active">logged-in</span>
          : <span className="badge">anonymous</span>}
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {kind === 'anon' && <span className="mono">{uid}</span>}
          {kind === 'anon' ? ' · ' : ''}{rows.length} events · {sessions} sessions · last {days} days
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <b>Can’t load activity.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Activity timeline</div>
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No activity.</div>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Action</th><th>Detail</th><th>Event</th></tr></thead>
            <tbody>
              {rows.map((e, i) => {
                const d = describe(e);
                return (
                  <tr key={i}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmt(e.ts)}</td>
                    <td>{d.action}</td>
                    <td style={{ fontWeight: 500 }}>{d.what}</td>
                    <td className="muted mono" style={{ fontSize: 12 }}>{e.event_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
