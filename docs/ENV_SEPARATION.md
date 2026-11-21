# Spec — count only production store installs (exclude TestFlight / dev)

## Problem

Every app build — App Store, TestFlight, and developer/debug — ships the **same
`qaro-customer` app key** and posts to the **same ingest**, so the dashboards mix
production with non-production traffic. Today 100% of app events are a non-production
build (`v1.0.7`), which is why orders in the dashboard don't reconcile with the
production backend.

**Goal:** the dashboards count events **only from real App Store / Play Store
installs**, never from TestFlight or dev/debug builds.

## Why a build flag or a per-build key is not enough

The binary Apple ships to the **App Store is the exact same binary** that went through
**TestFlight** — same version, same build number, same compiled code. So:

- `kReleaseMode` is `true` in **both** TestFlight and App Store → can't separate them.
- You can't bake a different app key per channel, because there's only one binary.

The only reliable signal is the **install channel, detected at runtime**, because the
OS records *how the app was installed* on the device.

## The mechanism — detect the channel at runtime, tag each event, filter to `prod`

1. On app start, compute a `channel` (`prod` / `testflight` / `sideload` / `dev`).
2. Pass it to the tracker; every event carries it as `env`.
3. The ingest stores `env`; every dashboard query defaults to `env = 'prod'`.
4. Non-prod builds still send (useful for debugging) but never show in production numbers.

### 1. Channel detection (the crux)

```dart
import 'dart:io';
import 'package:flutter/foundation.dart';

/// Resolve once at startup, before QaroTracker.init.
Future<String> resolveChannel() async {
  if (kDebugMode) return 'dev';            // Xcode/Android Studio debug builds
  if (Platform.isIOS)   return await _iosIsTestFlight() ? 'testflight' : 'prod';
  if (Platform.isAndroid) return await _androidIsPlay()  ? 'prod'       : 'sideload';
  return 'unknown';
}
```

**iOS — App Store vs TestFlight.** The App Store receipt filename differs:
`sandboxReceipt` = TestFlight (or a sandbox/dev install), `receipt` = App Store.

```swift
// MethodChannel on the native side:
let name = Bundle.main.appStoreReceiptURL?.lastPathComponent
let isTestFlight = (name == "sandboxReceipt")   // true on TestFlight, false on App Store
```

**Android — Play Store vs sideload.** The installer package names Play:

```kotlin
// API 30+: context.packageManager.getInstallSourceInfo(pkg).installingPackageName
// API <30: context.packageManager.getInstallerPackageName(pkg)
val installer = /* above */
val isPlay = installer == "com.android.vending" || installer == "com.google.android.feedback"
```

> You can wire these with a tiny `MethodChannel` each, or use the `store_checker`
> package (returns the install source cross-platform; it reads the same receipt /
> installer signals underneath). A MethodChannel is the most transparent and has no
> dependency.

**Android caveat:** Play **internal/closed testing** tracks *also* report
`com.android.vending`, so the installer check treats Play test-track installs as `prod`.
If you need to exclude Play testers too, give the testing track a distinct
`applicationIdSuffix` (e.g. `.beta`) and map that package to `testflight`, or gate on a
version allowlist. Sideloaded/adb dev installs are already excluded. iOS TestFlight is
fully separated by the receipt check.

**Optional hard gate.** If you'd rather non-prod builds not send at all (vs. send-and-
filter), set `enabled: channel == 'prod'` in the tracker config. Recommended default is
**send-and-filter** — you keep TestFlight/dev data for debugging, and the dashboard
still shows prod only.

### 2. Tracker — carry `env` (one field)

`flutter-tracker/lib/src/config.dart` — add:
```dart
/// Install channel: 'prod' | 'testflight' | 'sideload' | 'dev' | 'unknown'.
final String env;
```
(default `this.env = 'unknown'`, set in the const ctor)

`flutter-tracker/lib/src/event_tracker.dart` (~line 126, the `app:` map):
```dart
app: {
  'name': _config.appName,
  'version': _config.appVersion,
  'build': _config.appBuild,
  'platform': _config.platform,
  'env': _config.env,            // <-- add
},
```

`nannak-app` (the only app-side wiring) — at init:
```dart
final channel = await resolveChannel();
QaroTracker.init(QaroTrackerConfig(
  ingestUrl: 'https://analytics.qaro.ae',
  appKey: '<qaro-customer key>',
  appName: 'qaro-customer',
  appVersion: packageInfo.version,     // real version, not a hardcoded string
  platform: /* ios|android|web */,
  env: channel,                        // <-- the one line that matters
  // enabled: channel == 'prod',       // optional hard gate
));
```

### 3. Ingest — store `env` (server side)

`db/postgres/schema.sql` — add to `events`:
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS env TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS events_env_idx ON events (env);
```

`ingest-api/src/validate.ts` — capture it (allowlist, default unknown):
```ts
const ENVS = new Set(['prod', 'testflight', 'sideload', 'dev', 'staging']);
// ...in the row:
env: ENVS.has(asStr(app.env, 16)) ? asStr(app.env, 16) : 'unknown',
```
Add `env: string` to `EventRow` (pg.ts) and to the `COLS` list + the insert tuple.

> **Trust model:** `env` is self-reported by our own builds, same trust level as
> `app_name`. That's fine here (all builds are ours). If you ever want it tamper-proof,
> bind env to the app key instead (add `env` to `app_keys`, have `resolveAppKey` return
> `{appName, env}`, and stamp from the key) — but that can't separate App Store from
> TestFlight, since they share a key, so runtime detection is still required for that
> split. Keep the runtime `env`; the key-bound variant is only additive.

### 4. Queries — default to production

Every query endpoint already interpolates `timeCond(...).cond` into its `WHERE`, so one
change covers all of them. In `ingest-api/src/routes/query.ts`, have `timeCond` read
`req.query.env` and AND it in:

```ts
const env = String(req.query.env || 'prod');
const envCond = env === 'all' ? 'TRUE' : `env = '${env.replace(/[^a-z]/g, '')}'`;
// return cond as: `(${timeWindow}) AND ${envCond}`
```

Default `prod` means **every existing dashboard page shows production only with no page
changes**. `?env=testflight` or `?env=all` lets you inspect the rest.

### 5. Admin (optional, phase 2)

A small dropdown in the header (`prod` / `testflight` / `all`) that sets `?env=` in the
URL; `admin/lib/ingest.js` threads it onto each call. Not required for correctness —
the server default already fixes the numbers.

### 6. The marketing site (`qaro-web`)

qaro.ae is production. Set its events to `prod`: add `ANALYTICS_APP_ENV=prod` on the
marketing box and include `env` in `lib/analytics-track.js`'s envelope (one line). Then
the garage-portfolio funnel stays in the prod view.

## Existing data

All current app events are the non-prod `v1.0.7` build, so after adding the column,
reclassify them in one statement (don't leave them as `prod`):
```sql
UPDATE events SET env = 'testflight' WHERE env = 'unknown';
```
After this, the prod dashboards read **empty** — which is *correct*: no production store
build is instrumented yet. They fill in once the store build ships with `env='prod'`.

## Rollout order

1. **Analytics side (this repo):** add the `env` column, ingest capture, the `timeCond`
   default-`prod` filter; backfill existing rows → `testflight`. Deploy
   (`git pull` + `docker compose … up -d --build`). Dashboards now show prod = empty.
2. **App side (`nannak-app`):** add `resolveChannel()` + the two MethodChannels, pass
   `env:` into the config, and report the real `appVersion`. Ship to the stores.
3. Production store installs report `env='prod'`; TestFlight reports `testflight`; dev
   reports `dev`. Dashboards now show production only.
4. (Optional) add the admin env dropdown to inspect TestFlight/dev when debugging.

## What each side owns

| Change | Where | Effort |
|---|---|---|
| Channel detection (`resolveChannel` + 2 MethodChannels) | `nannak-app` | ~40 lines native + 10 Dart |
| `env` field in config + envelope | `flutter-tracker` | 2 lines |
| `env` column + capture + backfill | `qaro-analytics` ingest | small |
| `timeCond` default-`prod` filter | `qaro-analytics` query | ~3 lines, covers all pages |
| env dropdown (optional) | `qaro-analytics` admin | small |

The analytics-side changes (ingest + query + backfill) can land first as a PR in this
repo; the app-side detection is the piece that actually makes "store only" true.
