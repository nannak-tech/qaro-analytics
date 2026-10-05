# Event schema — the contract

Every QARO app emits events in **one envelope**. The Flutter `flutter-tracker` package builds it;
`ingest-api` validates it; ClickHouse stores it. Add new events by extending the **taxonomy** +
the ClickHouse column set, never by inventing new envelope shapes.

## Transport

`POST /v1/events` (batched, gzip-friendly)

```http
POST /v1/events
Content-Type: application/json
X-QARO-App-Key: <per-app ingest key>        # identifies the app, not the user
Authorization: <customer token, optional>    # present when logged in; never required

{
  "sent_at": "2026-10-05T12:34:57.123Z",
  "events": [ <Event>, <Event>, ... ]          # 1..500 per batch
}
```

Response `202 {"accepted": <n>, "rejected": <n>, "errors": [...] }`. Ingestion is **best-effort and
idempotent**: resending a batch (offline replay) is safe because every event carries a client
`event_id` used for dedupe.

## Event envelope

```jsonc
{
  "event_id":    "uuid-v4",                 // client-generated; dedupe key
  "event_name":  "ad_banner_click",         // MUST be in the taxonomy below
  "ts_client":   "2026-10-05T12:34:56.789Z",// device clock (ISO8601, ms)

  // identity
  "anonymous_id":"device-scoped-uuid",      // persisted on device; survives logout
  "customer_id": 1234,                      // currentUserId; null for guests
  "session_id":  "uuid-v4",                 // new on cold start / after 30m inactivity

  // app + device
  "app":   { "name": "qaro-customer", "version": "1.2.3", "build": "456", "platform": "ios|android|web" },
  "device":{ "model": "iPhone15,2", "os_version": "17.5", "locale": "en_AE" },

  // context
  "screen": "provider_detail",              // current screen when the event fired
  "geo":    { "lat": 25.1096, "lng": 55.1777 },   // optional, only when already available

  // ad attribution — present ONLY on ad_* events
  "ad": { "campaign_id": "cmp_8f…", "ad_id": "ad_22…", "placement": "home_banner", "partner_id": "prt_9…" },

  // event-specific payload (small, flat, string/number/bool)
  "properties": { "provider_id": 55, "service_id": 3, "source": "home" }
}
```

Server adds on ingest: `ts_server`, `ingest_ip` (not stored raw — see privacy), `geo_country`,
`geo_city`, and the resolved `app_key` → `app_name`.

## Identity & sessions

- **`anonymous_id`** — a UUID generated once and persisted (SharedPreferences). Stable across
  logout/login, so a guest who later signs in can be stitched to their `customer_id`.
- **`customer_id`** — `currentUserId` from the app (null for guests).
- **`session_id`** — minted at cold start and rotated after 30 min of inactivity or on
  resume-after-background. Lets us measure session journeys and drop-offs.

## Taxonomy (Phase 0 + 1)

`event_name` is a **closed set** — `ingest-api` rejects unknown names (prevents the endpoint
becoming an arbitrary writer). Each has a `provenance` of `user` (customer action) or `system`
(emitted automatically). Group → events:

| Group | Events | Key `properties` |
|-------|--------|------------------|
| Lifecycle | `app_open`, `app_background`, `session_start` | — |
| Navigation | `screen_view` | `screen_name`, `referrer_screen` |
| Discovery | `search`, `category_view`, `service_view`, `provider_view` | `query`,`results_count` / `category_id` / `service_id` / `provider_id` |
| **Ads** | `ad_impression`, `ad_click` | (uses the `ad` block) |
| **Contact** | `whatsapp_click`, `call_click`, `directions_click`, `email_click` | `provider_id`\|`partner_id`, `source_screen` |
| Commerce | `add_to_cart`, `booking_started`, `booking_step`, `slot_selected`, `vehicle_selected`, `address_selected`, `payment_started` | `service_id`, `step_name`, `step_index` |
| Orders | `order_placed`, `order_paid`, `order_cancelled` | `order_id`, `amount`, `currency`, `is_pickup` |
| Account | `login`, `logout`, `signup`, `otp_requested`, `otp_verified` | `method` |
| Engagement | `favorite_add`, `share`, `review_submitted` | `provider_id`, `rating` |

> **Ad events** (`ad_impression`, `ad_click`) are the *billable, must-be-exact* events — they
> carry the `ad` block and are what partner dashboards and invoicing read. Treat them as the
> highest-integrity events (dedupe strictly, never sample).

### Drop-offs

Drop-off is **not** a client event — it is derived server-side from funnels (a session that
reached step N but never step N+1). `booking_started → slot_selected → payment_started →
order_paid` is the canonical booking funnel.

## Privacy

- No raw IP is stored — ingestion derives coarse `geo_country` / `geo_city` then discards the IP.
- `properties` must stay small and must not contain secrets, full addresses, card data or OTPs.
- Customer name/phone live in the operational DB, not in the event stream — events reference
  `customer_id` only.
