import 'package:flutter/widgets.dart';
import 'event.dart';
import 'event_tracker.dart';

/// Typed convenience wrappers over [QaroTracker.track] for the common events,
/// so call sites read clearly and can't typo an event name.
class QaroEvents {
  static final _t = QaroTracker.instance;

  static void screen(String name, {String? referrer}) => _t.track('screen_view',
      properties: {'screen_name': name, if (referrer != null) 'referrer_screen': referrer});

  static void search(String query, {int? resultsCount}) => _t.track('search',
      properties: {'query': query, if (resultsCount != null) 'results_count': resultsCount});

  static void serviceView(dynamic serviceId) =>
      _t.track('service_view', properties: {'service_id': serviceId});
  static void providerView(dynamic providerId) =>
      _t.track('provider_view', properties: {'provider_id': providerId});

  // --- Ads (billable) ---
  static void adImpression(AdContext ad) => _t.track('ad_impression', ad: ad);
  static void adClick(AdContext ad) => _t.track('ad_click', ad: ad);

  // --- Contact ---
  static void whatsappClick({dynamic providerId, String? sourceScreen}) =>
      _t.track('whatsapp_click', properties: {
        if (providerId != null) 'provider_id': providerId,
        if (sourceScreen != null) 'source_screen': sourceScreen,
      });
  static void callClick({dynamic providerId, String? sourceScreen}) =>
      _t.track('call_click', properties: {
        if (providerId != null) 'provider_id': providerId,
        if (sourceScreen != null) 'source_screen': sourceScreen,
      });
  static void directionsClick({dynamic providerId}) =>
      _t.track('directions_click', properties: {if (providerId != null) 'provider_id': providerId});

  // --- Booking funnel ---
  static void bookingStarted(dynamic serviceId) =>
      _t.track('booking_started', properties: {'service_id': serviceId});
  static void bookingStep(String stepName, int stepIndex) =>
      _t.track('booking_step', properties: {'step_name': stepName, 'step_index': stepIndex});
  static void orderPlaced(dynamic orderId, {num? amount, bool? isPickup}) =>
      _t.track('order_placed', properties: {
        'order_id': orderId,
        if (amount != null) 'amount': amount,
        if (isPickup != null) 'is_pickup': isPickup,
      });
  static void orderCancelled(dynamic orderId) =>
      _t.track('order_cancelled', properties: {'order_id': orderId});
}

/// Wrap any tappable to log an event before running its onTap. Example:
///   TrackedTap(
///     event: 'ad_click',
///     ad: AdContext(campaignId: banner.campaignId, adId: banner.id, placement: 'home_banner'),
///     onTap: () => launchInBrowser(banner.linkUrl),
///     child: bannerImage,
///   )
class TrackedTap extends StatelessWidget {
  final String event;
  final Map<String, dynamic> properties;
  final AdContext? ad;
  final VoidCallback onTap;
  final Widget child;
  final HitTestBehavior behavior;

  const TrackedTap({
    super.key,
    required this.event,
    required this.onTap,
    required this.child,
    this.properties = const {},
    this.ad,
    this.behavior = HitTestBehavior.opaque,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: behavior,
      onTap: () {
        QaroTracker.instance.track(event, properties: properties, ad: ad);
        onTap();
      },
      child: child,
    );
  }
}
