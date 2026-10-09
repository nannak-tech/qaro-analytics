'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function Nav({ links }) {
  const path = usePathname();
  const sp = useSearchParams();
  // Carry the active date range across pages so "Today"/7d/etc. sticks when
  // navigating. Only the range keys — not page-specific ones like q/est.
  const rq = new URLSearchParams();
  for (const k of ['from', 'to', 'days']) {
    const v = sp.get(k);
    if (v) rq.set(k, v);
  }
  const qs = rq.toString();
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={qs ? `${l.href}?${qs}` : l.href}
            style={{
              padding: '9px 12px',
              borderRadius: 9,
              fontSize: 14,
              color: active ? 'var(--text)' : 'var(--muted)',
              background: active ? 'var(--panel-2)' : 'transparent',
              border: active ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
