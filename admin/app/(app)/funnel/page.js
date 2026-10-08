import { getFunnel } from '@/lib/ingest';
import { Funnel } from '@/components/Charts';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel, rangeQS } from '@/lib/range';

export const dynamic = 'force-dynamic';

// Steps can be a raw event, a page view (screen:<page>) or a CTA (cta:<label>),
// so the journey funnel mirrors the Pages & CTAs events.
const DEFAULT_STEPS = 'app_open,screen:home,screen:service_detail,booking_started,slot_selected,payment_started,order_paid';

const PRESETS = [
  { key: 'full', label: 'Full journey', steps: DEFAULT_STEPS },
  { key: 'booking', label: 'Booking → paid', steps: 'booking_started,slot_selected,payment_started,order_paid' },
  { key: 'ondemand', label: 'Pick service → paid', steps: 'screen:roadside_landing,cta:select_service,screen:service_detail,booking_started,order_paid' },
  { key: 'discovery', label: 'Browse → contact', steps: 'screen:home,screen:provider_detail,call_click' },
  { key: 'auth', label: 'Login → verified', steps: 'screen:login,cta:send_otp,cta:verify_otp' },
];

export default async function FunnelPage({ searchParams }) {
  const sp = await searchParams;
  const range = parseRange(sp);
  const steps = (sp?.steps || DEFAULT_STEPS);
  const stepList = steps.split(',').map((s) => s.trim()).filter(Boolean);

  let data = null, error = null;
  try {
    data = await getFunnel(stepList, range);
  } catch (e) {
    error = e.message;
  }

  const funnel = data?.funnel ?? [];
  const entrants = data?.entrants ?? 0;
  const last = funnel[funnel.length - 1];
  const overall = last?.pct ?? 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Journey funnel</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Ordered drop-off per session · {rangeLabel(range)}
          </div>
        </div>
        <RangeControls />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {PRESETS.map((p) => {
          const active = p.steps === steps;
          return (
            <a key={p.key} href={`/funnel?steps=${encodeURIComponent(p.steps)}&${rangeQS(range)}`}
               style={{
                 padding: '7px 13px', borderRadius: 8, fontSize: 13,
                 border: '1px solid var(--border)',
                 background: active ? 'var(--panel-2)' : 'transparent',
                 color: active ? 'var(--text)' : 'var(--muted)',
               }}>{p.label}</a>
          );
        })}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--brand)', marginBottom: 20 }}>
          <b>Can’t load the funnel.</b>
          <div className="muted" style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Entrants</div><div className="stat-value">{entrants.toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Completed</div><div className="stat-value">{(last?.reached ?? 0).toLocaleString()}</div></div>
        <div className="card"><div className="stat-label">Overall conversion</div><div className="stat-value">{overall}%</div></div>
      </div>

      <div className="card">
        <Funnel steps={funnel} />
      </div>
    </div>
  );
}
