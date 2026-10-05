import 'package:flutter/widgets.dart';
import 'event_tracker.dart';

/// Fires `screen_view` automatically on navigation. Add to MaterialApp:
///   navigatorObservers: [QaroRouteObserver()]
///
/// nannak-app pushes anonymous routes (no RouteSettings.name), so this falls
/// back to the route's widget type. For clean names, stamp
/// `RouteSettings(name: 'home')` in your navigation helper.
class QaroRouteObserver extends NavigatorObserver {
  String _name(Route<dynamic>? route) {
    if (route == null) return 'unknown';
    final s = route.settings.name;
    if (s != null && s.isNotEmpty) return s;
    return route.settings.arguments?.runtimeType.toString() ??
        route.runtimeType.toString();
  }

  void _view(Route<dynamic> route, Route<dynamic>? previous) {
    final name = _name(route);
    QaroTracker.instance.setCurrentScreen(name);
    QaroTracker.instance.track('screen_view', properties: {
      'screen_name': name,
      if (previous != null) 'referrer_screen': _name(previous),
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
    // Returning to the previous screen — update context (no screen_view spam).
    if (previousRoute is PageRoute) {
      QaroTracker.instance.setCurrentScreen(_name(previousRoute));
    }
    super.didPop(route, previousRoute);
  }
}
