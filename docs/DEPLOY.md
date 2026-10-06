# Deploy — ingest stack (Phase 1)

Stack: **Postgres (RDS)** as the single store + **ingest-api on AWS App Runner** +
DNS `analytics.qaro.ae`. No SaaS, all in-house.

## 1. Postgres (RDS)

Use a dedicated database for analytics — either a new small RDS Postgres instance, or a new
database on an existing RDS (keep it separate from the app's transactional DB so heavy
analytics queries never contend with production traffic).

1. Create the database, e.g. `qaro_analytics`, and a role `ingest` with privileges on it.
2. **Apply the schema** — from anywhere with network access to the RDS (a bastion, an app
   instance, or a temporary SG rule):
   ```bash
   psql "postgres://ingest:***@<rds-host>:5432/qaro_analytics" -f db/postgres/schema.sql
   ```
   This creates the `events` table (+ indexes) and the control-plane tables.
   *(Send me a temporary psql URL and I can apply + verify it, same as we did for the main DB.)*

## 2. ingest-api on App Runner

1. AWS → **App Runner → Create service → Source: GitHub** → `nannak-tech/qaro-analytics`,
   branch `main`, **Source directory: `ingest-api`**, automatic deploys. It reads
   `ingest-api/apprunner.yaml` (Node 18, `npm start`, port 4100).
2. **VPC connector:** RDS is private, so add an **App Runner VPC connector** on the VPC +
   subnets that can reach the RDS, and allow the connector's security group inbound **5432**
   on the RDS security group. (Same pattern as the app fleet → RDS.)
3. **Environment variables** (set in the console, not git):
   | Key | Value |
   |-----|-------|
   | `POSTGRES_URL` | `postgres://ingest:***@<rds-host>:5432/qaro_analytics` |
   | `PGSSL` | *(leave unset — RDS uses TLS; the client allows the RDS chain)* |
   | `DEV_APP_KEYS` | `qaro-customer:<APP_KEY>` *(the key generated this session)* |
   | `INTERNAL_QUERY_KEY` | *(the iq_… key generated this session)* |
4. **Health check:** HTTP path `/health` → returns `{postgres:true}` when connected.
5. Deploy → App Runner gives a URL like `https://xxxx.ap-south-1.awsapprunner.com`.

## 3. DNS

Route 53 → `analytics.qaro.ae` → add it under **App Runner → Custom domains** (App Runner
issues the TLS cert and gives the CNAME target to create).

## 4. Verify (I'll run this once it's up)

```bash
curl https://analytics.qaro.ae/health        # → {"status":"ok","postgres":true}

# send one event
curl -X POST https://analytics.qaro.ae/v1/events \
  -H 'content-type: application/json' -H "X-QARO-App-Key: <APP_KEY>" \
  -d '{"sent_at":"...","events":[{"event_id":"<uuid>","event_name":"app_open",
       "ts_client":"...","anonymous_id":"test","session_id":"test",
       "app":{"name":"qaro-customer","platform":"ios"},"properties":{}}]}'
# → 202 {"accepted":1,...}

# read it back (needs INTERNAL_QUERY_KEY)
curl "https://analytics.qaro.ae/v1/metrics/events?days=1" -H "x-internal-key: <KEY>"
```

## What I need from you to move

- A **psql URL** to the analytics Postgres (temporary access is fine) → I apply the schema and verify.
- Create the **App Runner** service + VPC connector with the env vars above → tell me the URL and
  I'll run the end-to-end check, then we point `analytics.qaro.ae` at it.

The **APP_KEY** and **INTERNAL_QUERY_KEY** were generated this session (kept out of git). The app
key also goes in the Flutter app's config.

## Scale note

The single `events` table + BRIN index is fine for early volume. When it grows, convert `events`
to monthly `RANGE` partitions on `ts_server` (and optionally add nightly rollup tables for ad
metrics / daily counts so dashboards never scan raw events). Nothing else changes.
