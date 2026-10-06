'use client';
import { useActionState, useState } from 'react';

// Invite form: on success the one-time acceptance link is shown once, built
// from the returned token. The token is never stored or shown again.
export default function InviteForm({ action, partnerId }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);

  const link = state?.token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/accept?token=${state.token}`
    : '';

  return (
    <div>
      <form action={formAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <input type="hidden" name="partner_id" value={partnerId} />
        <div style={{ flex: '1 1 220px' }}>
          <label className="stat-label label" htmlFor="inv-email">Email</label>
          <input id="inv-email" name="email" type="email" className="inp" placeholder="person@partner.com" />
        </div>
        <div style={{ flex: '0 0 170px' }}>
          <label className="stat-label label" htmlFor="inv-role">Role</label>
          <select id="inv-role" name="role" className="sel" defaultValue="partner_member">
            <option value="partner_member">Member (view)</option>
            <option value="partner_admin">Admin (can invite)</option>
          </select>
        </div>
        <button className="btn" disabled={pending}>{pending ? 'Creating…' : 'Create invite'}</button>
      </form>

      {state?.error && <div className="err">{state.error}</div>}

      {state?.token && (
        <div className="card" style={{ marginTop: 12, background: 'var(--panel-2)' }}>
          <div className="stat-label">Invite link for {state.email} — copy it now, it won’t be shown again</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <code className="mono" style={{ wordBreak: 'break-all', flex: 1 }}>{link}</code>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ border: '1px solid var(--border)' }}
              onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
