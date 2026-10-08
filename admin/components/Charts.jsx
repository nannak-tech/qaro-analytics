'use client';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, Legend,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const fmtDay = (d) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
  catch { return d; }
};

/** Daily series: data = [{ day, value }]. */
export function TimeSeries({ data, color = 'var(--brand)', label = 'events' }) {
  if (!data?.length) {
    return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: 'var(--muted)', fontSize: 12 }}
               stroke="var(--border)" />
        <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          labelFormatter={fmtDay}
          formatter={(v) => [v, label]}
        />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2}
              fill="url(#g)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Daily users trend: data = [{ day, users, logged_in, sessions }]. */
export function UsersTrend({ data }) {
  if (!data?.length) {
    return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No activity in this range</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" />
        <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          labelFormatter={fmtDay} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="users" name="Users" stroke="var(--brand)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="logged_in" name="Logged-in" stroke="var(--brand-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Funnel: steps = [{ step, reached, pct }]. Rendered as proportion bars. */
export function Funnel({ steps }) {
  if (!steps?.length) return <div className="muted">No funnel data</div>;
  const max = Math.max(...steps.map((s) => s.reached), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].reached : s.reached;
        const dropPct = prev ? Math.round(((prev - s.reached) / prev) * 1000) / 10 : 0;
        return (
          <div key={s.step}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14 }}>
              <span><span className="muted">{i + 1}.</span> {s.step}</span>
              <span>
                <b>{s.reached.toLocaleString()}</b> <span className="muted">· {s.pct}%</span>
                {i > 0 && dropPct > 0 && (
                  <span style={{ color: 'var(--brand)', marginLeft: 8 }}>▼ {dropPct}%</span>
                )}
              </span>
            </div>
            <div style={{ height: 14, background: 'var(--panel-2)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                width: `${(s.reached / max) * 100}%`, height: '100%',
                background: 'var(--brand)', borderRadius: 7, transition: 'width .3s',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
