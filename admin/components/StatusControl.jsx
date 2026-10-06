'use client';
import { useActionState } from 'react';

// Inline status dropdown that submits its server action on change.
export default function StatusControl({ action, id, value, options, extra = {} }) {
  const [, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} style={{ display: 'inline' }}>
      <input type="hidden" name="id" value={id} />
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select
        name="status"
        defaultValue={value}
        disabled={pending}
        className="sel"
        style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
        onChange={(e) => e.target.form.requestSubmit()}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </form>
  );
}
