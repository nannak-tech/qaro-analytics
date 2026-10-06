import Nav from '@/components/Nav';
import LogoutButton from '@/components/LogoutButton';

export default function AppLayout({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}>
      <aside
        style={{
          borderRight: '1px solid var(--border)',
          padding: 18,
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand)' }} />
          <div style={{ fontWeight: 700 }}>QARO Analytics</div>
        </div>
        <Nav />
        <div style={{ marginTop: 'auto' }}>
          <LogoutButton />
        </div>
      </aside>
      <main style={{ padding: '26px 30px', maxWidth: 1180 }}>{children}</main>
    </div>
  );
}
