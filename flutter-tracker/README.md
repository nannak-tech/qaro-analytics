# qaro_tracker

Shared Flutter event tracker for the QARO apps. One singleton, batched + offline-buffered,
posts the event envelope (see `../docs/EVENT_SCHEMA.md`) to the qaro-analytics ingest API.

## Add to nannak-app

`pubspec.yaml`:
```yaml
dependencies:
  qaro_tracker:
    git:
      url: git@github.com:nannak-tech/qaro-analytics.git
      path: flutter-tracker
    # or, while developing locally:
    # path: ../../qaro-analytics/flutter-tracker
```

No new transitive deps you don't already have: `http`, `shared_preferences`, `uuid`.

## Wire it (≈5 edits, per the code-map)

**1. Init in `lib/main.dart`** (after `Firebase.initializeApp`, before `runApp`):
```dart
await QaroTracker.instance.init(
  QaroTrackerConfig(
    ingestUrl: 'https://analytics.qaro.ae',   // ingest-api base
    appKey: const String.fromEnvironment('QARO_ANALYTICS_KEY'), // or from .env
    appName: 'qaro-customer',
    appVersion: packageInfo.version,          // optional
    platform: kIsWeb ? 'web' : (Platform.isIOS ? 'ios' : 'android'),
  ),
  // read the current token/customer lazily so login/logout are picked up:
  authToken: () => currentUserToken,          // global in global_variable.dart
  customerId: currentUserId,                  // global in global_variable.dart
);
```

**2. Auto screen tracking** — add the observer to `MaterialApp`:
```dart
MaterialApp(
  navigatorKey: navigatorKey,
  navigatorObservers: [QaroRouteObserver()],
  ...
)
```
(Optional, for real screen names: stamp `RouteSettings(name: 'home')` inside
`lib/core/common/navigation/custom_nav.dart`. For the bottom tabs, add a
`ref.listen(selectedNavIndex, ...)` in `lib/features/navebar/navbar.dart` that calls
`QaroEvents.screen(tabName)`.)

**3. Identity on login/logout** — in `lib/features/auth/repositry/auth_repositry.dart`:
```dart
QaroTracker.instance.setCustomer(currentUserId); // after login sets currentUserId
QaroTracker.instance.setCustomer(null);          // in logout()
```

**4. Instrument the key taps** (central seams the code-map found):
- **Ad banner** — `lib/core/widgets/banner_slider.dart` (`NewBannerSlider` onTap):
  ```dart
  QaroEvents.adClick(AdContext(
    campaignId: banner.campaignId, adId: banner.id, placement: 'home_banner'));
  ```
  (and `QaroEvents.adImpression(...)` when a banner becomes visible.)
- **Call button** — `lib/core/common/makePhoneCall.dart` (one line covers most call buttons):
  ```dart
  QaroEvents.callClick(providerId: providerId, sourceScreen: screen);
  ```
- **WhatsApp** — `lib/features/hospitals/screen/hospital_view.dart` (and `garage_Details_card.dart`):
  ```dart
  QaroEvents.whatsappClick(providerId: providerId, sourceScreen: 'provider_detail');
  ```
- **Booking funnel** — emit from the controllers
  (`garage_checkout_controller.dart`, `normalgarage_booking_controller.dart`):
  `QaroEvents.bookingStarted(...)`, `bookingStep('slot', 1)`, `orderPlaced(...)`.

## API

```dart
QaroTracker.instance.track('event_name', properties: {...}, ad: AdContext(...));
QaroEvents.whatsappClick(providerId: 55, sourceScreen: 'provider_detail');
QaroEvents.adImpression(AdContext(campaignId: 'cmp_1', placement: 'home_banner'));
QaroTracker.instance.flush();            // force-send (rarely needed)
QaroTracker.instance.setCustomer(id);    // on login/logout
```

Events flush when the queue hits `batchSize` (20), every `flushInterval` (30s), and on app
background. Offline events persist to `SharedPreferences` and replay on next launch;
`event_id` makes replays idempotent server-side.
