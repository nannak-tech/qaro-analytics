'use client';
import { useRouter } from 'next/navigation';
import { rangeQS } from '@/lib/range';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

export default function EstRow({ est, range }) {
  const router = useRouter();
  const href = `/establishments/${encodeURIComponent(est.id)}?${rangeQS(range)}`;
  return (
    <tr
      onClick={() => router.push(href)}
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{ fontWeight: 600 }}>{est.name || <span className="mono">{est.id}</span>}</td>
      <td style={{ textAlign: 'right' }}>{est.views.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{est.activities.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{est.users.toLocaleString()}</td>
      <td className="muted">{fmt(est.last_seen)} ›</td>
    </tr>
  );
}
