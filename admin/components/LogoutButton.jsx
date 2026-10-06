'use client';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/login', { method: 'DELETE' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13,
        border: '1px solid var(--border)', background: 'transparent',
        color: 'var(--muted)', cursor: 'pointer', textAlign: 'left',
      }}
    >
      Sign out
    </button>
  );
}
