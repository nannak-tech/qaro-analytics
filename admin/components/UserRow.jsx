'use client';
import { useRouter } from 'next/navigation';
import { maskMobile } from '@/lib/mask';

const fmt = (d) => {
  try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};
const shortId = (s) => (s && s.length > 12 ? `${s.slice(0, 8)}…` : s);

// A whole-row clickable user entry → opens that user's activity timeline.
export default function UserRow({ user, days }) {
  const router = useRouter();
  const href = `/users/${user.kind}/${encodeURIComponent(user.uid)}?days=${Math.max(days, 90)}`;
  const isCustomer = user.kind === 'customer';

  return (
    <tr
      onClick={() => router.push(href)}
      style={{ cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <td style={{ fontWeight: 600 }}>
        {isCustomer
          ? (maskMobile(user.mobile) || `customer #${user.uid}`)
          : <span className="mono">{shortId(user.uid)}</span>}
      </td>
      <td>{isCustomer
            ? <span className="badge active">logged-in</span>
            : <span className="badge">anonymous</span>}</td>
      <td style={{ textAlign: 'right' }}>{user.events.toLocaleString()}</td>
      <td style={{ textAlign: 'right' }}>{user.sessions.toLocaleString()}</td>
      <td className="muted">{fmt(user.last_seen)} ›</td>
    </tr>
  );
}
