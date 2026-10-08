import { getUsers, getUsersDaily } from '@/lib/ingest';
import UserRow from '@/components/UserRow';
import RangeControls from '@/components/RangeControls';
import { UsersTrend } from '@/components/Charts';
import { parseRange, rangeLabel, rangeQS } from '@/lib/range';

export const dynamic = 'force-dynamic';

export default async function UsersPage({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const search = sp?.q || '';

  let rows = [], daily = [], error = null;
  try {
    [{ rows }, { rows: daily }] = await Promise.all([
      getUsers(range, search),
      getUsersDaily(range),
    ]);
  } catch (e) { error = e.message; }

  const customers = rows.filter((r) => r.kind === 'customer').length;
  const anons = rows.length - customers;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1>User activity</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Logged-in users by mobile · anonymous users by id · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Users</div><div className="stat-value">{rows.length}</div></div>
        <div className="card"><div className="stat-label">Logged-in</div><div className="stat-value">{customers}</div></div>
        <div className="card"><div className="stat-label">Anonymous</div><div className="stat-value">{anons}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Daily users trend</div>
        <UsersTrend data={daily} />
      </div>

      <form method="GET" style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input name="q" defaultValue={search} placeholder="Search mobile or anonymous id…"
               className="inp" style={{ flex: '1 1 280px', maxWidth: 380 }} />
        {range.from ? (<>
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to" value={range.to} />
        </>) : <input type="hidden" name="days" value={range.days} />}
        <button type="submit" className="btn">Search</button>
      </form>

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
                <UserRow key={`${r.kind}-${r.uid}`} user={r} range={range} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
