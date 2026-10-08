import Link from 'next/link';
import { getUsers } from '@/lib/ingest';

export const dynamic = 'force-dynamic';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};
const shortId = (s) => (s && s.length > 12 ? `${s.slice(0, 8)}…` : s);

export default async function UsersPage({ searchParams }) {
  const sp = await searchParams;
  const days = Number(sp?.days) || 30;
  const search = sp?.q || '';

  let rows = [], error = null;
  try { ({ rows } = await getUsers(days, search)); } catch (e) { error = e.message; }

  const customers = rows.filter((r) => r.kind === 'customer').length;
  const anons = rows.length - customers;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20 }}>
        <div>
          <h1>User activity</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Logged-in users by mobile · anonymous users by id · last {days} days
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <a key={d} href={`/users?days=${d}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
               style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)',
                        background: d === days ? 'var(--panel-2)' : 'transparent',
                        color: d === days ? 'var(--text)' : 'var(--muted)' }}>{d}d</a>
          ))}
        </div>
      </div>

      <form method="GET" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input name="q" defaultValue={search} placeholder="Search mobile or anonymous id…"
               className="inp" style={{ flex: '1 1 280px', maxWidth: 380 }} />
        <input type="hidden" name="days" value={days} />
        <button type="submit" className="btn">Search</button>
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Users</div><div className="stat-value">{rows.length}</div></div>
        <div className="card"><div className="stat-label">Logged-in</div><div className="stat-value">{customers}</div></div>
        <div className="card"><div className="stat-label">Anonymous</div><div className="stat-value">{anons}</div></div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)' }}>
          <b>Can’t load users.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        {rows.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No users in this window.</div>
        ) : (
          <table>
            <thead><tr>
              <th>User</th><th>Type</th>
              <th style={{ textAlign: 'right' }}>Events</th>
              <th style={{ textAlign: 'right' }}>Sessions</th>
              <th>Last seen</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.uid}`}>
                  <td>
                    <Link href={`/users/${r.kind}/${encodeURIComponent(r.uid)}?days=${Math.max(days, 90)}`}
                          style={{ color: 'var(--text)', fontWeight: 600 }}>
                      {r.kind === 'customer' ? (r.mobile || `customer #${r.uid}`) : <span className="mono">{shortId(r.uid)}</span>}
                    </Link>
                  </td>
                  <td>{r.kind === 'customer'
                        ? <span className="badge active">logged-in</span>
                        : <span className="badge">anonymous</span>}</td>
                  <td style={{ textAlign: 'right' }}>{r.events.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{r.sessions.toLocaleString()}</td>
                  <td className="muted">{fmt(r.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
