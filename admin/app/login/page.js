'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const field = {
  width: '100%', marginTop: 6, marginBottom: 14, padding: '10px 12px',
  borderRadius: 9, background: 'var(--panel-2)', color: 'var(--text)',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      const { role } = await res.json();
      router.replace(role === 'qaro_admin' ? '/' : '/ads');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Login failed');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form onSubmit={submit} className="card" style={{ width: 340, padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/qaro-logo.png" alt="QARO" width={26} height={26} style={{ borderRadius: 7, display: 'block' }} />
          <div style={{ fontWeight: 700 }}>QARO Analytics</div>
        </div>
        <label className="stat-label" htmlFor="email">Email</label>
        <input id="email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
               style={{ ...field, border: '1px solid var(--border)' }} />
        <label className="stat-label" htmlFor="pw">Password</label>
        <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
               style={{ ...field, border: `1px solid ${error ? 'var(--brand)' : 'var(--border)'}` }} />
        {error && <div style={{ color: 'var(--brand)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button type="submit" disabled={busy}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: 'none',
                   background: 'var(--brand)', color: '#fff', fontWeight: 600,
                   cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
