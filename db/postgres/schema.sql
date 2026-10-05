-- QARO analytics — Postgres control plane
-- Relational, transactional data: ingest keys, partners/orgs, seats & auth,
-- campaigns, ads, placements. The high-volume event stream lives in ClickHouse.
-- Apply:  psql "$POSTGRES_URL" -f db/postgres/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---- Ingest auth ---------------------------------------------------------
-- One key per app (customer app, partner app). Sent as X-QARO-App-Key.
-- Only the hash is stored; the plaintext is shown once at creation.
CREATE TABLE IF NOT EXISTS app_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_name    TEXT NOT NULL,                 -- 'qaro-customer' | 'qaro-partner'
    key_hash    TEXT NOT NULL UNIQUE,          -- sha256(plaintext)
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Partners / orgs (ads tenants) --------------------------------------
-- A partner org (producer / garage / auto partner). Row-level tenant key for
-- everything in the ads portal; partners only ever see their own partner_id.
CREATE TABLE IF NOT EXISTS partners (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'garage',   -- garage | producer | auto_partner
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Users & seats (admin + partner auth) -------------------------------
-- role: 'qaro_admin' sees everything; 'partner_admin'/'partner_member' are
-- scoped to their partner_id (NULL partner_id only allowed for qaro_admin).
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         CITEXT UNIQUE,                 -- requires citext; fallback: TEXT
    password_hash TEXT,
    name          TEXT,
    role          TEXT NOT NULL DEFAULT 'partner_member',
    partner_id    UUID REFERENCES partners(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT admin_or_scoped CHECK (role = 'qaro_admin' OR partner_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_partner ON users(partner_id);

-- Single-use, hashed, expiring invites — partner multi-seat (pattern from team.ts).
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

-- ---- Ads: campaigns → ads → placements ----------------------------------
-- placement = a slot in the app ('home_banner', 'provider_list_banner', …).
CREATE TABLE IF NOT EXISTS campaigns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft',    -- draft | active | paused | ended
    starts_at   TIMESTAMPTZ,
    ends_at     TIMESTAMPTZ,
    budget      NUMERIC(12,2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_partner ON campaigns(partner_id);

CREATE TABLE IF NOT EXISTS ads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    partner_id    UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,  -- denormalised for fast scoping
    placement     TEXT NOT NULL,                  -- must match app placement ids
    title         TEXT,
    image_url     TEXT NOT NULL,
    target_url    TEXT,                            -- deep link / external
    weight        INT NOT NULL DEFAULT 1,          -- rotation weight
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads(placement, status);
CREATE INDEX IF NOT EXISTS idx_ads_partner ON ads(partner_id);

-- campaign_id / ad_id / partner_id above are the SAME ids stamped onto the
-- `ad` block of ad_impression / ad_click events in ClickHouse — that join is
-- what turns raw events into per-partner billable metrics.
