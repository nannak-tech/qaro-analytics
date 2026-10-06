'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/funnel', label: 'Journey funnel' },
  { href: '/ads', label: 'Ad metrics' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {LINKS.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
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
