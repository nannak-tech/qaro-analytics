# QARO Analytics — Admin dashboard

Next.js (App Router) dashboard for the customer-journey + ads analytics stack.
It renders server-side, calling the ingest-api **query** endpoints with the
internal key — that key never reaches the browser.

## Pages
- **Overview** (`/`) — event volume over time + per-event breakdown.
- **Journey funnel** (`/funnel`) — ordered drop-off for preset journeys
  (booking→paid, discovery→contact, signup→verified).
- **Ad metrics** (`/ads`) — impressions / clicks / CTR per campaign, per partner.

## Auth
Single shared-password gate. `middleware.js` protects every route except
`/login`; `/api/login` verifies `ADMIN_PASSWORD` server-side and sets an opaque
session cookie (`ADMIN_SESSION_TOKEN`). The password never leaves the server.

## Env
See `.env.example`:
- `INGEST_URL` — ingest-api base (compose service `http://ingest-api:4100`).
- `INTERNAL_QUERY_KEY` — must match ingest-api's key.
- `ADMIN_PASSWORD` — sign-in password.
- `ADMIN_SESSION_TOKEN` — cookie token, `openssl rand -hex 24`.

## Local
```bash
npm install
cp .env.example .env.local   # point INGEST_URL at http://localhost:4100
npm run dev                  # http://localhost:3100
```

## Production
Built as part of the one-box stack — see `../compose.prod.yml` (service `admin`)
and `../deploy/Caddyfile` (`admin.qaro.ae`). The Dockerfile produces a Next
standalone image listening on `:3100`.
