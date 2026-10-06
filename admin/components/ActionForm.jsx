'use client';
import { useActionState, useEffect, useRef } from 'react';

// Generic form bound to a server action via useActionState. Renders its inputs
// as children; shows the action's { error } / { message }. Resets on success.
export default function ActionForm({ action, submit = 'Save', hidden = {}, children }) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);

  return (
    <form ref={ref} action={formAction}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      {state?.error && <div className="err">{state.error}</div>}
      {state?.ok && state?.message && <div className="ok">{state.message}</div>}
      <div style={{ marginTop: 10 }}>
        <button className="btn" disabled={pending}>{pending ? 'Saving…' : submit}</button>
      </div>
    </form>
  );
}
