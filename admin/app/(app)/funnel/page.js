import { getFunnel } from '@/lib/ingest';
import { Funnel } from '@/components/Charts';
import RangeControls from '@/components/RangeControls';
import { parseRange, rangeLabel, rangeQS } from '@/lib/range';

export const dynamic = 'force-dynamic';

// Steps can be a raw event, a page view (screen:<page>), any page matching a
// substring (screenlike:<val>), or a CTA (cta:<label>) — so the journey funnel
// mirrors the real app flow built from pages + CTAs + events.
// Default landing = path-agnostic order conversion, so completed orders are
// ALWAYS visible. The ordered funnel counts a step only if it happened after
// the previous one in the same session; real orderers don't follow a strict
// browse→order sequence (returning users, direct-to-checkout), so any funnel
// gated on browse/garage steps shows 0 orders even when orders happened.
const DEFAULT_STEPS = 'app_open,cta:place_order,order_placed,order_paid';
const GARAGE_STEPS = 'app_open,screen:home,screenlike:listing,screen:provider_detail,booking_started,slot_selected,screen:my_locations,screen:checkout_garage,screen:add_card,cta:place_order,screen:order_success_garage,order_paid';

const PRESETS = [
  // Path-agnostic conversion: works for BOTH garage and on-demand orders, and
  // avoids booking_started/payment_started, which fire unreliably/out-of-order.
  { key: 'orders', label: 'Orders → paid', steps: DEFAULT_STEPS },
  { key: 'full', label: 'Full journey (garage)', steps: GARAGE_STEPS },
  { key: 'ondemand', label: 'On-demand', steps: 'app_open,cta:select_service,screen:checkout_ondemand,cta:place_order,order_placed,order_paid' },
  { key: 'discovery', label: 'Browse → contact', steps: 'screen:home,screenlike:listing,screen:provider_detail,call_click' },
  { key: 'auth', label: 'Login → verified', steps: 'screen:login,cta:send_otp,cta:verify_otp' },
];

// Friendly display names per step spec, so the funnel reads like the real journey.
const STEP_LABELS = {
  'app_open': 'App open',
  'screen:home': 'Home',
  'screenlike:listing': 'Service listing',
  'screen:provider_detail': 'Provider detail',
  'screen:service_detail': 'Service detail',
  'screen:roadside_landing': 'Roadside landing',
  'cta:select_service': 'Select service',
  'booking_started': 'Booking started',
  'slot_selected': 'Slot selected',
  'screen:my_locations': 'Address screen',
  'cta:map_location_selected': 'Address selected (map)',
  'cta:address_label': 'Address added',
  'screen:checkout_garage': 'Payment / review',
  'screen:checkout_ondemand': 'Payment / review',
  'screen:add_card': 'Add card',
  'cta:card_saved': 'Card saved',
  'cta:place_order': 'Place order',
  'order_placed': 'Order placed',
  'payment_started': 'Payment started',
  'screen:order_success_garage': 'Confirmation',
  'order_paid': 'Order paid',
  'call_click': 'Called provider',
  'screen:login': 'Login',
  'cta:send_otp': 'OTP requested',
  'cta:verify_otp': 'OTP verified',
};

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

  const funnel = (data?.funnel ?? []).map((s) => ({
    ...s,
    step: STEP_LABELS[s.spec] || s.step,
  }));
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

      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.5, maxWidth: 820 }}>
        Each step counts a session only if it happened <em>after</em> the previous step. “Orders → paid” shows every
        completed order (garage or on-demand); the detailed journeys (Full journey, On-demand) show browse-to-checkout
        drop-off, but can read 0 at checkout when buyers skip straight there — use “Orders → paid” for true conversions.
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
