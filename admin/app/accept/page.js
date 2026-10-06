'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const field = {
  width: '100%', marginTop: 6, marginBottom: 14, padding: '10px 12px',
  borderRadius: 9, background: 'var(--panel-2)', color: 'var(--text)',
  border: '1px solid var(--border)',
};

function AcceptForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') || '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true); setError('');
    const res = await fetch('/api/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name, password }),
    });
    setBusy(false);
    if (res.ok) {
      const { role } = await res.json();
      router.replace(role === 'qaro_admin' ? '/' : '/ads');
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Could not accept invite');
    }
  }

  if (!token) {
    return <div className="card" style={{ width: 340, padding: 26 }}>Missing invite token.</div>;
  }

  return (
    <form onSubmit={submit} className="card" style={{ width: 360, padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--brand)' }} />
        <div style={{ fontWeight: 700 }}>QARO Analytics</div>
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        You’ve been invited. Set your name and a password to finish.
      </p>
      <label className="stat-label" htmlFor="name">Your name</label>
      <input id="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} style={field} />
      <label className="stat-label" htmlFor="pw">Password</label>
      <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
             style={{ ...field, borderColor: error ? 'var(--brand)' : 'var(--border)' }} />
      {error && <div style={{ color: 'var(--brand)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <button type="submit" disabled={busy}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: 'none',
                 background: 'var(--brand)', color: '#fff', fontWeight: 600,
                 cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
        {busy ? 'Setting up…' : 'Create account'}
      </button>
    </form>
  );
}

export default function AcceptPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <Suspense fallback={<div className="muted">Loading…</div>}>
        <AcceptForm />
      </Suspense>
    </div>
  );
}
