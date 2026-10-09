'use client';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, Legend,
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const fmtDay = (d) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); }
  catch { return d; }
};

// Format an x-axis bucket. Hourly buckets arrive as "YYYY-MM-DDTHH:00" local
// strings and render as "HH:00"; daily buckets render as "DD Mon".
const fmtBucket = (d, gran) => {
  if (gran === 'hour') {
    const m = /T(\d\d):/.exec(String(d));
    return m ? `${m[1]}:00` : String(d);
  }
  return fmtDay(d);
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

/** Generic daily/hourly multi-line trend. lines = [{ key, name, color }]. */
export function DailyTrend({ data, lines, gran = 'day' }) {
  if (!data?.length) {
    return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No data in this range</div>;
  }
  const fmt = (d) => fmtBucket(d, gran);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmt} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" />
        <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          labelFormatter={fmt} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
                stroke={l.color} strokeWidth={2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Daily/hourly users trend: data = [{ day, users, logged_in, sessions }]. */
export function UsersTrend({ data, gran = 'day' }) {
  if (!data?.length) {
    return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No activity in this range</div>;
  }
  const fmt = (d) => fmtBucket(d, gran);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tickFormatter={fmt} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" />
        <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          labelFormatter={fmt} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="users" name="Users" stroke="var(--brand)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="logged_in" name="Logged-in" stroke="var(--brand-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Horizontal bar chart of top pages by visits.
 * data = [{ screen, views, sessions }]; already scoped to the active range filter.
 * `limit` caps how many bars show (default 10).
 */
export function TopPagesBar({ data, limit = 10 }) {
  if (!data?.length) {
    return <div className="muted" style={{ padding: 40, textAlign: 'center' }}>No page views in this range</div>;
  }
  const rows = [...data].sort((a, b) => b.views - a.views).slice(0, limit);
  // Give each page name room; grow height with the number of bars.
  const height = Math.max(160, rows.length * 34 + 40);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--border)" />
        <YAxis type="category" dataKey="screen" width={140} tick={{ fill: 'var(--text)', fontSize: 12 }} stroke="var(--border)" />
        <Tooltip
          cursor={{ fill: 'var(--panel-2)' }}
          contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
          labelStyle={{ color: 'var(--text)' }}
          itemStyle={{ color: 'var(--text)' }}
          formatter={(v, _n, p) => [`${v} views · ${p?.payload?.sessions ?? 0} sessions`, p?.payload?.screen]} />
        <Bar dataKey="views" radius={[0, 5, 5, 0]} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={r.screen} fill={i === 0 ? 'var(--brand)' : 'var(--brand-2)'} />
          ))}
        </Bar>
      </BarChart>
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
