'use client';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { todayStr } from '@/lib/range';

const btn = (active) => ({
  padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
  border: '1px solid var(--border)',
  background: active ? 'var(--panel-2)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--muted)',
});

// Shared time-range picker: Today / 7d / 30d / 90d presets + a calendar range.
// Preserves all other query params (partner_id, steps, q, …) when navigating.
export default function RangeControls() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();

  const from = sp.get('from');
  const to = sp.get('to');
  const daysParam = sp.get('days');
  const days = daysParam ? Number(daysParam) : null;
  const today = todayStr();

  const go = (params) => {
    const next = new URLSearchParams(sp.toString());
    next.delete('days'); next.delete('from'); next.delete('to');
    for (const [k, v] of Object.entries(params)) if (v) next.set(k, v);
    router.push(`${path}?${next.toString()}`);
  };

  // No range in the URL = default = Today, so Today shows active on first load.
  const isDefault = !from && !daysParam;
  const isToday = isDefault || (from && from === to && from === today);
  const pickFrom = (v) => go({ from: v, to: to && to >= v ? to : v });
  const pickTo = (v) => go({ from: from || v, to: v });

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button style={btn(isToday)} onClick={() => go({ from: today, to: today })}>Today</button>
      {[7, 30, 90].map((d) => (
        <button key={d} style={btn(days === d)} onClick={() => go({ days: String(d) })}>{d}d</button>
      ))}
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 6 }}>
        <input type="date" max={today} value={from || ''} onChange={(e) => pickFrom(e.target.value)}
               className="inp" style={{ width: 'auto', padding: '5px 8px', fontSize: 13,
                 color: from ? 'var(--text)' : 'var(--muted)' }} aria-label="From date" />
        <span className="muted" style={{ fontSize: 12 }}>→</span>
        <input type="date" max={today} value={to || ''} onChange={(e) => pickTo(e.target.value)}
               className="inp" style={{ width: 'auto', padding: '5px 8px', fontSize: 13,
                 color: to ? 'var(--text)' : 'var(--muted)' }} aria-label="To date" />
      </span>
    </div>
  );
}
