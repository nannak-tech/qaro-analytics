# qaro-analytics

Customer-journey analytics **and** partner-facing ads-analytics platform for QARO.

Two jobs:
1. **Customer journey** — capture every meaningful activity in the QARO apps (screen views,
   searches, ad-banner taps, WhatsApp/call taps, booking steps, payments, cancellations) so we
   can see funnels, drop-offs and behaviour with full control over the data.
2. **Ads platform** — let producers, garages and auto partners run campaigns on QARO and give
   them precise, trustworthy metrics (impressions, clicks, CTR, conversions) for the ads they run.

## Architecture

```
QARO Flutter apps (nannak-app customer, nannakgarage partner)
   └─ flutter-tracker  (shared Dart package — the "common component")
        • auto screen_view (NavigatorObserver)   • batched + offline-buffered
        • tap events (ad_banner_click, whatsapp_click, call_click, booking_step …)
        └── POST /v1/events ─────────────────────────────┐
                                                          ▼
                              ingest-api  (Node + TypeScript, Express)
                              • app-key auth + customer/session identity
                              • validate against a typed event taxonomy
                              • enrich (ip→geo, device) · dedupe by event_id
                              ├── writes high-volume events ─────► ClickHouse   (events, ad metrics)
                              └── reads control-plane data ──────► Postgres     (partners, campaigns,
                                                                                 orgs, seats, auth)
                                                          ▼
                              query-api (part of ingest-api): funnels, journeys, ad metrics
                                                          ▼
                              admin  (Next.js — modelled on Cituna's admin-next)
                               ├── QARO internal: journeys, funnels, drop-offs, retention
                               └── Partner portal: per-campaign impressions/clicks/CTR (multi-tenant)
```

**Why two stores:** ClickHouse is the right engine for the high-volume append-only event stream
and fast funnel/aggregation queries; Postgres holds the relational control plane (partners, orgs,
seats, campaigns, ad placements, auth) that needs transactions and foreign keys.

## Monorepo layout

| Folder | What | Stack |
|--------|------|-------|
| `flutter-tracker/` | Shared Flutter package: `EventTracker`, offline buffer, `NavigatorObserver`, tracked-tap widgets | Dart |
| `ingest-api/` | Event ingestion + query API | Node 20 + TypeScript + Express + `@clickhouse/client` + `pg` |
| `db/clickhouse/` | ClickHouse DDL (events + rollups) | SQL |
| `db/postgres/` | Postgres DDL (control plane) | SQL |
| `admin/` | Analytics admin + partner portal | Next.js 16 (App Router) |
| `docs/` | Event schema (the contract) + design notes | — |

## Build order (agreed)

- **Phase 0 — foundation (this scaffold):** event contract, ClickHouse schema, `ingest-api`
  (`POST /v1/events`), and the `flutter-tracker` package. ✅ in progress
- **Phase 1 — customer journey:** wire the tracker into `nannak-app`; admin dashboards for
  funnels, drop-offs, session journeys, retention.
- **Phase 2 — ads platform:** campaign/ad/placement management, banner serving, impression/click
  attribution, partner-facing multi-tenant dashboards.

## Start (local)

```bash
# 1. stores
docker compose up -d            # clickhouse + postgres (see docker-compose.yml)
# 2. apply schema
clickhouse-client < db/clickhouse/schema.sql
psql "$POSTGRES_URL" -f db/postgres/schema.sql
# 3. ingest API
cd ingest-api && cp .env.example .env && npm i && npm run dev
```

See [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md) for the event contract the Flutter apps emit.
