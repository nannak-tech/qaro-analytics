'use client';
import { useRouter } from 'next/navigation';
import { rangeQS } from '@/lib/range';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

// One garage's web funnel. The row links to the establishment timeline (reused),
// where every event for this garage id — app and web — is listed.
export default function GarageRow({ g, range }) {
  const router = useRouter();
  const href = `/establishments/${encodeURIComponent(g.id)}?${rangeQS(range)}`;
  return (
    <tr
      onClick={() => router.push(href)}
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{ fontWeight: 600 }}>{g.name || <span className="mono">{g.id}</span>}</td>
      <td style={{ textAlign: 'right' }}>{g.views.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{g.claims.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{g.started.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{g.submitted.toLocaleString()}</td>
      <td style={{ textAlign: 'right', fontWeight: 700 }}>{g.paid.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{g.people.toLocaleString()}</td>
      <td className="muted">{fmt(g.last_seen)} ›</td>
    </tr>
  );
}
