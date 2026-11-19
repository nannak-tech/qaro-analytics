# Deploy — Garage portfolio funnel (qaro.ae web tracking)

Ships the garage listing/claim/payment funnel from the qaro.ae marketing site into
the analytics platform, plus the **Garage portfolio** dashboard page. Merged to `main`
in both repos (`qaro-analytics` PR #1 → `48a1412`, `qaro-marketing` PR #1 → `4a497f4`).

This runbook deploys the **analytics box** and provisions the `qaro-web` app key.
The marketing site itself (qaro.ae `/garages` catalog, theme, tracker, `/api/track`
proxy) is already deployed via the bundle pipeline — only the key wiring (Part C)
remains there.

**What's new in this deploy**
- ingest-api: 6 new taxonomy events (`claim_started`, `listing_view`, `listing_started`,
  `listing_submitted`, `listing_payment_started`, `listing_payment_done`) + the
  `GET /v1/garage-portfolio` query endpoint.
- admin: the **Garage portfolio** page + nav link.
- No Postgres schema migration (the query uses the existing events table and the
  existing `properties->>'establishment_id'` expression index; `app_keys` already exists).

> Access the box via **EC2 Console → instance `qaro-analytics` (13.235.57.212) →
> Connect → Session Manager**. There is no SSH key.

---

## Part A — Deploy the new build

Pulls `main` and rebuilds **ingest-api** and **admin**. Postgres is untouched (its
volume persists).

```bash
cd /opt/qaro-analytics
sudo git pull
sudo docker compose -f compose.prod.yml --env-file deploy/.env up -d --build
```

Verify:

```bash
curl -s https://analytics.qaro.ae/health
curl -s -o /dev/null -w "garage-portfolio -> HTTP %{http_code}\n" https://analytics.qaro.ae/v1/garage-portfolio
```

`/health` should report `postgres:true`; garage-portfolio should now be **200** (it is
404 before this deploy). Still 404 ⇒ the rebuild didn't pick up `main` — re-check `git pull`.

---

## Part B — Create the `qaro-web` app key

On the same box. Generates a key, stores only its **sha256 hash** in `app_keys`, and
prints the plaintext **once** for Part C. The ingest key cache refreshes within 60s.

```bash
cd /opt/qaro-analytics
KEY="qaro_$(openssl rand -hex 24)"
HASH=$(printf %s "$KEY" | sha256sum | cut -d' ' -f1)
sudo docker compose -f compose.prod.yml --env-file deploy/.env exec -T postgres \
  psql -U ingest -d qaro_analytics \
  -c "INSERT INTO app_keys (app_name, key_hash) VALUES ('qaro-web', '$HASH');"
echo "----------------------------------------------------------------"
echo "ANALYTICS_APP_KEY=$KEY"
echo "^ copy this into the marketing box's code/.env (shown once; DB holds only the hash)"
```

> **Alternative (no DB write):** add `qaro-web:<plaintext>` to the `DEV_APP_KEYS` line in
> `deploy/.env` and restart. The `app_keys` table above is the cleaner control-plane path
> and survives env changes.

How validation works: ingest resolves `X-QARO-App-Key` by checking `DEV_APP_KEYS` first,
then `SELECT ... FROM app_keys WHERE key_hash = sha256(<key>) AND active = true`
(`ingest-api/src/auth.ts`).

---

## Part C — Wire the marketing box (the qaro.ae / qaro-seo box)

The qaro.ae marketing server runs as the systemd service **`qaro-seo.service`**
(`/opt/qaro/app/code/server.js`), and its env is loaded from **`/etc/qaro.env`**
(the unit's `EnvironmentFile`) — **not** `code/.env`. The bundle deploy excludes `.env`
and never rewrites `/etc/qaro.env`, so setting the key there persists across future
deploys.

**1. Add the analytics vars to `/etc/qaro.env`** (idempotent — clears any old lines first):

```bash
sudo sed -i '/^ANALYTICS_APP_KEY=/d;/^ANALYTICS_INGEST_URL=/d;/^ANALYTICS_APP_NAME=/d' /etc/qaro.env
sudo tee -a /etc/qaro.env >/dev/null <<'EOF'
ANALYTICS_INGEST_URL=https://analytics.qaro.ae
ANALYTICS_APP_NAME=qaro-web
ANALYTICS_APP_KEY=<the value printed in Part B>
EOF
```

**2. Confirm and restart:**

```bash
sudo grep ANALYTICS /etc/qaro.env
sudo systemctl restart qaro-seo
sudo systemctl status qaro-seo --no-pager | head -5
```

Only `ANALYTICS_APP_KEY` is strictly required (`ANALYTICS_INGEST_URL` and
`ANALYTICS_APP_NAME` already default correctly in code), but setting all three is explicit.

No CORS change is needed: the marketing server posts to ingest server-to-server; the
browser only talks to the same-origin `/api/track` proxy, which forwards with the key
server-side.

---

## Part D — Verify end-to-end

**1. Key + taxonomy accepted** (same shell as Part B, so `$KEY` is set):

```bash
curl -s -X POST https://analytics.qaro.ae/v1/events \
  -H "Content-Type: application/json" \
  -H "X-QARO-App-Key: $KEY" \
  -d "{\"events\":[{\"event_name\":\"provider_view\",\"event_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"anonymous_id\":\"deploy-smoke\",\"session_id\":\"deploy-smoke\",\"screen\":\"garage_profile\",\"ts_client\":\"$(date -u +%FT%TZ)\",\"properties\":{\"establishment_id\":\"SMOKE-1\",\"establishment_name\":\"Deploy Smoke Test\"}}]}"
```

A 2xx with an accepted count ⇒ key valid **and** the new taxonomy is live. A 4xx
"unknown event" ⇒ the ingest rebuild didn't take. This creates one throwaway
"Deploy Smoke Test" row in the dashboard — ignore or delete it later.

**2. Real path:** open `https://qaro.ae/garages`, click a garage, open the claim overlay
— those fire `provider_view` / `claim_started` through `/api/track`.

**3. Dashboard:** log into `admin.qaro.ae`, confirm **Garage portfolio** appears in the
left nav, open it, and check the funnel columns (Profile views → Claims → Form started →
Submitted → Paid) populate.

---

## Order matters

Do **A before C** — the old ingest rejects the 6 new event names, so set the marketing
key only after the box is rebuilt. Until then, the live site's `/api/track` safely
no-ops (no data lost, just not recorded).

## Day-2

- **Logs:** `sudo docker compose -f compose.prod.yml logs -f ingest-api`
- **Re-deploy:** re-run Part A.
- The box IP `13.235.57.212` has no Elastic IP yet — a stop/start changes the public IP
  and breaks DNS. See the open-items note before any instance stop/start.

## Optional hardening

`/v1/garage-portfolio` is world-readable once live (same as the existing
`/v1/establishments`; only `/v1/metrics` and `/v1/funnel` sit behind `requireQueryKey`).
To gate it behind the internal key, add one line next to the existing guards in
`ingest-api/src/routes/query.ts`:

```js
queryRouter.use('/v1/garage-portfolio', requireQueryKey);
```

The admin already sends `x-internal-key`, so the dashboard keeps working. That's a code
change ⇒ a small follow-up PR, not part of this deploy.
