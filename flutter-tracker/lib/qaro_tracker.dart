/// QARO analytics — shared Flutter event tracker.
///
/// Batched, offline-buffered event capture that posts to the qaro-analytics
/// ingest API. See README.md for integration.
library qaro_tracker;

export 'src/config.dart';
export 'src/event.dart' show QaroEvent, AdContext;
export 'src/event_tracker.dart' show QaroTracker;
export 'src/route_observer.dart' show QaroRouteObserver;
export 'src/tracked_tap.dart' show QaroEvents, TrackedTap;
