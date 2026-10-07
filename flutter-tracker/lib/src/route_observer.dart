import 'package:flutter/widgets.dart';
import 'event_tracker.dart';

/// Emits `screen_view` only for routes that carry a real `RouteSettings.name`.
/// nannak-app mostly pushes anonymous routes, so page views are recorded
/// explicitly instead — call `QaroEvents.screen('<page>')` in each screen's
/// initState (that also sets the current screen for CTA/funnel events). This
/// observer stays for any named routes and avoids emitting generic
/// `MaterialPageRoute` noise.
class QaroRouteObserver extends NavigatorObserver {
  String? _namedOrNull(Route<dynamic>? route) {
    final s = route?.settings.name;
    return (s != null && s.isNotEmpty) ? s : null;
  }

  void _view(Route<dynamic> route, Route<dynamic>? previous) {
    final name = _namedOrNull(route);
    if (name == null) return; // anonymous route → handled by explicit screen()
    QaroTracker.instance.setCurrentScreen(name);
    QaroTracker.instance.track('screen_view', properties: {
      'screen_name': name,
      if (_namedOrNull(previous) != null) 'referrer_screen': _namedOrNull(previous),
    });
  }

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute) _view(route, previousRoute);
    super.didPush(route, previousRoute);
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute is PageRoute) _view(newRoute, oldRoute);
    super.didReplace(newRoute: newRoute, oldRoute: oldRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    // Restore context to the revealed page only if it has a real name.
    final name = _namedOrNull(previousRoute);
    if (previousRoute is PageRoute && name != null) {
      QaroTracker.instance.setCurrentScreen(name);
    }
    super.didPop(route, previousRoute);
  }
}
