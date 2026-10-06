-- QARO analytics — Postgres (single database: events + control plane).
-- Apply:  psql "$POSTGRES_URL" -f db/postgres/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ===========================================================================
-- EVENTS — the activity stream. Append-only; dedup by event_id so offline
-- replays are idempotent (INSERT ... ON CONFLICT DO NOTHING).
-- At higher volume, convert to monthly RANGE partitions on ts_server; the BRIN
-- index already makes time-range scans cheap in the meantime.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS events (
    event_id     UUID PRIMARY KEY,
    event_name   TEXT        NOT NULL,
    provenance   TEXT        NOT NULL DEFAULT 'user',

    ts_server    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ts_client    TIMESTAMPTZ,

    anonymous_id TEXT        NOT NULL,
    customer_id  BIGINT,
    session_id   TEXT        NOT NULL,

    app_name     TEXT,
    app_version  TEXT,
    platform     TEXT,
    device_model TEXT,
    os_version   TEXT,
    locale       TEXT,

    screen       TEXT,
    lat          DOUBLE PRECISION,
    lng          DOUBLE PRECISION,

    -- ad attribution (populated only on ad_* events)
    campaign_id  TEXT NOT NULL DEFAULT '',
    ad_id        TEXT NOT NULL DEFAULT '',
    placement    TEXT NOT NULL DEFAULT '',
    partner_id   TEXT NOT NULL DEFAULT '',

    geo_country  TEXT NOT NULL DEFAULT '',
    geo_city     TEXT NOT NULL DEFAULT '',

    properties   JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_name_ts   ON events (event_name, ts_server DESC);
CREATE INDEX IF NOT EXISTS idx_events_ts_brin   ON events USING brin (ts_server);
CREATE INDEX IF NOT EXISTS idx_events_session   ON events (session_id, ts_server);
CREATE INDEX IF NOT EXISTS idx_events_customer  ON events (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_campaign  ON events (partner_id, campaign_id, ts_server) WHERE campaign_id <> '';
CREATE INDEX IF NOT EXISTS idx_events_props_gin ON events USING gin (properties);

-- ===========================================================================
-- CONTROL PLANE — ingest keys, partners/orgs, seats, campaigns, ads.
-- ===========================================================================

-- One key per app (customer app, partner app). Sent as X-QARO-App-Key.
-- Only the hash is stored; plaintext shown once at creation.
CREATE TABLE IF NOT EXISTS app_keys (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name   TEXT NOT NULL,                  -- 'qaro-customer' | 'qaro-partner'
    key_hash   TEXT NOT NULL UNIQUE,           -- sha256(plaintext)
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partner org (producer / garage / auto partner) — the ads tenant key.
CREATE TABLE IF NOT EXISTS partners (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'garage', -- garage | producer | auto_partner
    status     TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Users & seats. role 'qaro_admin' sees everything; partner roles are scoped
-- to their partner_id.
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE,
    password_hash TEXT,
    name          TEXT,
    role          TEXT NOT NULL DEFAULT 'partner_member',
    partner_id    UUID REFERENCES partners(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT admin_or_scoped CHECK (role = 'qaro_admin' OR partner_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_partner ON users(partner_id);

-- Single-use, hashed, expiring invites — partner multi-seat.
CREATE TABLE IF NOT EXISTS invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'partner_member',
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ads: campaigns → ads → placements. The ids here are the SAME ids stamped onto
-- the `ad` block of ad_impression / ad_click events — that join turns raw events
-- into per-partner billable metrics.
CREATE TABLE IF NOT EXISTS campaigns (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft',  -- draft | active | paused | ended
    starts_at  TIMESTAMPTZ,
    ends_at    TIMESTAMPTZ,
    budget     NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_partner ON campaigns(partner_id);

CREATE TABLE IF NOT EXISTS ads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    placement   TEXT NOT NULL,
    title       TEXT,
    image_url   TEXT NOT NULL,
    target_url  TEXT,
    weight      INT NOT NULL DEFAULT 1,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads(placement, status);
CREATE INDEX IF NOT EXISTS idx_ads_partner   ON ads(partner_id);
