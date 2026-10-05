# admin (Phase 1+)

Next.js (App Router) analytics console — QARO internal dashboards + the partner ads portal.
Not built yet; this is the plan, grounded in the reusable parts of Cituna's `admin-next`.

## Reuse directly from `visibility-os-app/admin-next` (domain-neutral)
- `middleware.js` — edge JWT gate (swap `role==='founder'` for `qaro_admin` / `partner_*`).
- `context/AuthContext.js`, `utils/api.js` (axios + 401 interceptor), `next.config.mjs` (same-origin `/api` proxy).
- `components/AdminShell.jsx` (sidebar shell) + all of `components/ui/` (Card/Stat, Table, Tabs, Pill, Button, FilterBar, EmptyState).
- Chart templates: `components/PerformanceChart.jsx` (time-series), `app/funnel/page.js` (funnel/drop-off), `components/TrafficTrend.jsx` (sparkline) + `lib/trafficSeries.js` gap-filler.
- `lib/acquisition.js` — UTM / ad-platform maps + `buildCampaignLink()` (useful for the ads portal).

## Build (reads the ingest-api query endpoints)
**QARO internal:**
- Overview — top-line event volumes, DAU proxy (`/v1/metrics/events`).
- Journey funnel / drop-offs — `/v1/funnel?steps=booking_started,slot_selected,payment_started,order_paid`.
- Session journeys, retention.

**Partner ads portal (multi-tenant):**
- Per-campaign impressions / clicks / CTR (`/v1/metrics/ad?partner_id=…`), scoped to the
  partner's own `partner_id` only (enforced in this layer; the ingest query key is internal).
- Campaign & ad management (CRUD against the Postgres control plane).

## Auth / tenancy
Replace Cituna's founder-allowlist with a real role model: `qaro_admin` (sees all) vs
`partner_admin` / `partner_member` (scoped to one `partner_id`). Reuse the invite mechanics
from Cituna's `team.ts`. Tables already defined in `../db/postgres/schema.sql`.
