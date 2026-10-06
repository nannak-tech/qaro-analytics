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
                              └── events + control plane ───────► Postgres  (events, ad metrics,
                                                                              partners, campaigns, auth)
                                                          ▼
                              query-api (part of ingest-api): funnels, journeys, ad metrics
                                                          ▼
                              admin  (Next.js — modelled on Cituna's admin-next)
                               ├── QARO internal: journeys, funnels, drop-offs, retention
                               └── Partner portal: per-campaign impressions/clicks/CTR (multi-tenant)
```

**One store:** Postgres holds both the append-only event stream *and* the relational control plane
(partners, orgs, seats, campaigns, ad placements, auth) — fewest moving parts, no SaaS, runs on
your own infra (RDS). The `events` table is append-only with a BRIN time index + dedupe by
`event_id`; at higher volume it converts to monthly partitions (and ClickHouse remains a drop-in
later if aggregation volume ever demands it — only the store layer would change).

## Monorepo layout

| Folder | What | Stack |
|--------|------|-------|
| `flutter-tracker/` | Shared Flutter package: `EventTracker`, offline buffer, `NavigatorObserver`, tracked-tap widgets | Dart |
| `ingest-api/` | Event ingestion + query API | Node 20 + TypeScript + Express + `pg` |
| `db/postgres/` | Postgres DDL — events + control plane | SQL |
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
# 1. store (schema auto-applies on first boot via docker-entrypoint-initdb.d)
docker compose up -d            # postgres
# 2. ingest API
cd ingest-api && cp .env.example .env && npm i && npm run dev
```

## Deploy

Easiest: one EC2 running the whole stack (Postgres + ingest-api + auto-HTTPS) via
`compose.prod.yml` — see **[docs/DEPLOY_SIMPLE.md](docs/DEPLOY_SIMPLE.md)**. The managed
alternative (App Runner + VPC connector) is in [docs/AWS_SETUP.md](docs/AWS_SETUP.md).

See [`docs/EVENT_SCHEMA.md`](docs/EVENT_SCHEMA.md) for the event contract the Flutter apps emit.
