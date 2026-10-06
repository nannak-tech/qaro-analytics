# Deploy — ingest stack (Phase 1)

Stack: **ClickHouse Cloud** (event store) + **ingest-api on AWS App Runner** + DNS
`analytics.qaro.ae`. Postgres is deferred to Phase 2 (ads control plane) — the ingest-api
runs without it and takes its app key from an env var.

## 1. ClickHouse Cloud

1. Create a service at <https://clickhouse.cloud> (region close to users, e.g. `ap-south-1`).
2. From **Connect**, grab: **HTTPS endpoint** (`https://<id>.<region>.aws.clickhouse.cloud:8443`),
   **username** (`default`), **password**.
3. **Send those three to me** — I apply `db/clickhouse/schema.sql` over HTTPS and confirm the
   tables + materialized views exist. (You can also apply it yourself:
   `clickhouse-client --host <id>.<region>.aws.clickhouse.cloud --secure --password < db/clickhouse/schema.sql`.)
4. (Optional, recommended) create a dedicated user `ingest` with INSERT on `qaro_analytics`
   instead of using `default`.

## 2. ingest-api on App Runner

1. AWS Console → **App Runner → Create service → Source: GitHub** → connect
   `nannak-tech/qaro-analytics`, branch `main`, **Source directory: `ingest-api`**,
   deployment: automatic.
2. It picks up `ingest-api/apprunner.yaml` (Node 18, `npm start`, port 4100).
3. **Environment variables** (set here, not in git):
   | Key | Value |
   |-----|-------|
   | `CLICKHOUSE_URL` | `https://<id>.<region>.aws.clickhouse.cloud:8443` |
   | `CLICKHOUSE_DB` | `qaro_analytics` |
   | `CLICKHOUSE_USER` | `ingest` (or `default`) |
   | `CLICKHOUSE_PASSWORD` | *(App Runner secret)* |
   | `DEV_APP_KEYS` | `qaro-customer:<APP_KEY>` *(the key I generated)* |
   | `INTERNAL_QUERY_KEY` | *(random; the admin portal uses it to read metrics)* |
4. **Health check:** HTTP path `/health`.
5. Deploy → App Runner gives a URL like `https://xxxx.ap-south-1.awsapprunner.com`.

## 3. DNS

Route 53 → `analytics.qaro.ae` **CNAME** → the App Runner default domain (App Runner issues the
TLS cert once you add the custom domain under **App Runner → Custom domains**).

## 4. Verify (I'll run this once it's up)

```bash
# health
curl https://analytics.qaro.ae/health      # → clickhouse:true

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

- The **ClickHouse Cloud** endpoint + user + password → I apply the schema and verify.
- Create the **App Runner** service (steps above) with the env vars → tell me the URL and I'll
  run the end-to-end check, then we point `analytics.qaro.ae` at it.

The **APP_KEY** for the customer app was generated this session (kept out of git). It goes in
`DEV_APP_KEYS` and in the Flutter app's config.
