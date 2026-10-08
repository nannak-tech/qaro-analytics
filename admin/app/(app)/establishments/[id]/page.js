import Link from 'next/link';
import { getEstablishmentActivity } from '@/lib/ingest';
import { maskMobile } from '@/lib/mask';
import { parseRange, rangeLabel, rangeQS } from '@/lib/range';
import RangeControls from '@/components/RangeControls';

export const dynamic = 'force-dynamic';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

// Friendly action label per event row.
function actionLabel(e) {
  const map = {
    screen_view: 'Page view', call_click: 'Call', whatsapp_click: 'WhatsApp',
    directions_click: 'Directions', email_click: 'Email', cta_click: 'CTA',
    booking_started: 'Booking started', slot_selected: 'Slot selected',
    order_placed: 'Order placed', order_paid: 'Order paid', order_cancelled: 'Order cancelled',
  };
  return map[e.event_name] || e.event_name;
}

export default async function EstablishmentDetail({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const range = parseRange(sp);

  let data = null, error = null;
  try { data = await getEstablishmentActivity(decodeURIComponent(id), range); }
  catch (e) { error = e.message; }

  const activities = data?.activities ?? [];
  const customers = data?.customers ?? [];
  const title = data?.name || decodeURIComponent(id);
  const totalActs = activities.filter((a) => a.event_name !== 'screen_view').reduce((s, a) => s + a.count, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Link href="/establishments" className="muted" style={{ fontSize: 13 }}>← All establishments</Link>
          <h1 style={{ marginTop: 6 }}>{title}</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            <span className="mono">{decodeURIComponent(id)}</span> · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>
      <div style={{ height: 16 }} />

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load establishment.</b><div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Page views</div><div className="stat-value">{(data?.views ?? 0).toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Activities</div><div className="stat-value">{totalActs.toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Customers</div><div className="stat-value">{customers.length.toLocaleString()}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Activity breakdown</div>
        {activities.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No activity yet.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Action</th><th>Label</th>
              <th style={{ textAlign: 'right' }}>Count</th>
              <th style={{ textAlign: 'right' }}>Customers</th>
            </tr></thead>
            <tbody>
              {activities.map((a, i) => (
                <tr key={i}>
                  <td><span className="badge">{actionLabel(a)}</span></td>
                  <td className="muted">{a.cta || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{a.count.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{a.users.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Customers</div>
        {customers.length === 0 ? (
          <div className="muted" style={{ padding: 16 }}>No customers yet.</div>
        ) : (
          <table>
            <thead><tr>
              <th>Customer</th><th>Type</th>
              <th style={{ textAlign: 'right' }}>Events here</th>
              <th>Last seen</th>
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={`${c.kind}-${c.uid}`}>
                  <td>
                    <Link href={`/users/${c.kind}/${encodeURIComponent(c.uid)}?${rangeQS(range)}`}
                          style={{ color: 'var(--text)', fontWeight: 600 }}>
                      {c.kind === 'customer' ? (maskMobile(c.mobile) || `customer #${c.uid}`)
                                             : <span className="mono">{c.uid.slice(0, 8)}…</span>}
                    </Link>
                  </td>
                  <td>{c.kind === 'customer' ? <span className="badge active">logged-in</span> : <span className="badge">anonymous</span>}</td>
                  <td style={{ textAlign: 'right' }}>{c.events.toLocaleString()}</td>
                  <td className="muted">{fmt(c.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
