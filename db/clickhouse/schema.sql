-- QARO analytics — ClickHouse event store
-- High-volume, append-only event stream + rollups for funnels and ad metrics.
-- Apply:  clickhouse-client --multiquery < db/clickhouse/schema.sql

CREATE DATABASE IF NOT EXISTS qaro_analytics;

-- ---------------------------------------------------------------------------
-- Raw events. One wide table; `properties` keeps event-specific fields as JSON.
-- ReplacingMergeTree on event_id makes offline replay idempotent (dupes collapse
-- on merge; queries that must be exact use `FINAL` or GROUP BY event_id).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qaro_analytics.events
(
    event_id        UUID,
    event_name      LowCardinality(String),
    provenance      LowCardinality(String) DEFAULT 'user',   -- user | system

    ts_server       DateTime64(3, 'UTC'),
    ts_client       DateTime64(3, 'UTC'),

    -- identity
    anonymous_id    String,
    customer_id     Nullable(UInt64),
    session_id      String,

    -- app + device
    app_name        LowCardinality(String),
    app_version     LowCardinality(String),
    platform        LowCardinality(String),                  -- ios | android | web
    device_model    String,
    os_version      String,
    locale          LowCardinality(String),

    -- context
    screen          LowCardinality(String),
    lat             Nullable(Float64),
    lng             Nullable(Float64),

    -- ad attribution (only populated for ad_* events)
    campaign_id     String DEFAULT '',
    ad_id           String DEFAULT '',
    placement       LowCardinality(String) DEFAULT '',
    partner_id      String DEFAULT '',

    -- enrichment (ip resolved to geo, then discarded)
    geo_country     LowCardinality(String) DEFAULT '',
    geo_city        String DEFAULT '',

    -- event-specific payload
    properties      String DEFAULT '{}'                      -- JSON object
)
ENGINE = ReplacingMergeTree(ts_server)
PARTITION BY toYYYYMM(ts_server)
ORDER BY (event_name, ts_server, session_id, event_id)
TTL toDateTime(ts_server) + INTERVAL 24 MONTH               -- 2y raw retention
SETTINGS index_granularity = 8192;

-- Journey queries (per session, time-ordered) hit this skip index well.
ALTER TABLE qaro_analytics.events ADD INDEX IF NOT EXISTS idx_session session_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE qaro_analytics.events ADD INDEX IF NOT EXISTS idx_customer customer_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE qaro_analytics.events ADD INDEX IF NOT EXISTS idx_campaign campaign_id TYPE bloom_filter GRANULARITY 4;

-- ---------------------------------------------------------------------------
-- Ad metrics rollup — the billable numbers partners see. A materialized view
-- keeps a per-day, per-ad aggregate of impressions/clicks so partner dashboards
-- are instant and don't scan raw events.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qaro_analytics.ad_metrics_daily
(
    day             Date,
    partner_id      String,
    campaign_id     String,
    ad_id           String,
    placement       LowCardinality(String),
    impressions     AggregateFunction(uniqExact, UUID),      -- dedup by event_id
    clicks          AggregateFunction(uniqExact, UUID)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (partner_id, campaign_id, ad_id, placement, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS qaro_analytics.ad_metrics_daily_mv
TO qaro_analytics.ad_metrics_daily AS
SELECT
    toDate(ts_server)                                        AS day,
    partner_id, campaign_id, ad_id, placement,
    uniqExactState(if(event_name = 'ad_impression', event_id, NULL)) AS impressions,
    uniqExactState(if(event_name = 'ad_click',      event_id, NULL)) AS clicks
FROM qaro_analytics.events
WHERE event_name IN ('ad_impression', 'ad_click') AND campaign_id != ''
GROUP BY day, partner_id, campaign_id, ad_id, placement;

-- Read example (partner dashboard):
--   SELECT day, campaign_id,
--          uniqExactMerge(impressions) imp,
--          uniqExactMerge(clicks)      clk,
--          round(clk / nullIf(imp,0) * 100, 2) ctr
--   FROM qaro_analytics.ad_metrics_daily
--   WHERE partner_id = {pid:String} AND day >= today() - 30
--   GROUP BY day, campaign_id ORDER BY day;

-- ---------------------------------------------------------------------------
-- Daily event counts — cheap top-line metrics (DAU proxy, event volumes).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qaro_analytics.event_counts_daily
(
    day             Date,
    event_name      LowCardinality(String),
    platform        LowCardinality(String),
    events          AggregateFunction(count),
    sessions        AggregateFunction(uniq, String),
    customers       AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(day)
ORDER BY (day, event_name, platform);

CREATE MATERIALIZED VIEW IF NOT EXISTS qaro_analytics.event_counts_daily_mv
TO qaro_analytics.event_counts_daily AS
SELECT
    toDate(ts_server) AS day, event_name, platform,
    countState()           AS events,
    uniqState(session_id)  AS sessions,
    uniqState(customer_id) AS customers
FROM qaro_analytics.events
GROUP BY day, event_name, platform;
