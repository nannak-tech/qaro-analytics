import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import LogoutButton from '@/components/LogoutButton';
import { getSession, isAdmin } from '@/lib/session';

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const admin = isAdmin(session);
  const links = admin
    ? [
        { href: '/', label: 'Overview' },
        { href: '/funnel', label: 'Journey funnel' },
        { href: '/ads', label: 'Ad metrics' },
        { href: '/partners', label: 'Partners' },
      ]
    : [
        { href: `/partners/${session.pid}`, label: 'My account' },
        { href: '/ads', label: 'Ad metrics' },
      ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}>
      <aside
        style={{
          borderRight: '1px solid var(--border)', padding: 18,
          position: 'sticky', top: 0, height: '100vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand)' }} />
          <div style={{ fontWeight: 700 }}>QARO Analytics</div>
        </div>
        <Nav links={links} />
        <div style={{ marginTop: 'auto' }}>
          <div className="muted" style={{ fontSize: 12, padding: '8px 12px', lineHeight: 1.5 }}>
            <div style={{ color: 'var(--text)' }}>{session.name || session.email}</div>
            <div>{admin ? 'QARO admin' : (session.pname || 'Partner')}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ padding: '26px 30px', maxWidth: 1180 }}>{children}</main>
    </div>
  );
}
