'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace('/');
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
          <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand)' }} />
          <div style={{ fontWeight: 700 }}>QARO Analytics</div>
        </div>
        <label className="stat-label" htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%', marginTop: 6, marginBottom: 14, padding: '10px 12px',
            borderRadius: 9, background: 'var(--panel-2)',
            border: `1px solid ${error ? 'var(--brand)' : 'var(--border)'}`, color: 'var(--text)',
          }}
        />
        {error && <div style={{ color: 'var(--brand)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 9, border: 'none',
            background: 'var(--brand)', color: '#fff', fontWeight: 600,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
