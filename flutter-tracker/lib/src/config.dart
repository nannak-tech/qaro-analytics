/// Configuration for [QaroTracker]. Provide once at app start.
class QaroTrackerConfig {
  /// Base URL of the ingest API, e.g. https://analytics.qaro.ae
  /// Events are posted to `<ingestUrl>/v1/events`.
  final String ingestUrl;

  /// Per-app ingest key, sent as `X-QARO-App-Key`.
  final String appKey;

  /// Logical app name, e.g. "qaro-customer" / "qaro-partner".
  final String appName;
  final String appVersion;
  final String appBuild;

  /// "ios" | "android" | "web".
  final String platform;

  /// Optional device fields (left blank if you don't wire device_info_plus).
  final String deviceModel;
  final String osVersion;
  final String locale;

  /// Flush when this many events are queued...
  final int batchSize;

  /// ...or when this interval elapses, whichever first.
  final Duration flushInterval;

  /// Rotate the session id after this much inactivity / time in background.
  final Duration sessionTimeout;

  /// Cap on events held in the offline buffer (oldest dropped past this).
  final int maxBuffer;

  /// When false, the tracker is a no-op (handy for debug builds / opt-out).
  final bool enabled;

  const QaroTrackerConfig({
    required this.ingestUrl,
    required this.appKey,
    required this.appName,
    this.appVersion = '',
    this.appBuild = '',
    this.platform = '',
    this.deviceModel = '',
    this.osVersion = '',
    this.locale = '',
    this.batchSize = 20,
    this.flushInterval = const Duration(seconds: 30),
    this.sessionTimeout = const Duration(minutes: 30),
    this.maxBuffer = 1000,
    this.enabled = true,
  });

  Uri get eventsUri => Uri.parse('$ingestUrl/v1/events');
}
