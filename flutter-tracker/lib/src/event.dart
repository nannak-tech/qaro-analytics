import 'package:uuid/uuid.dart';

const _uuid = Uuid();

/// Optional ad-attribution block, required on `ad_impression` / `ad_click`.
class AdContext {
  final String campaignId;
  final String? adId;
  final String? placement;
  final String? partnerId;
  const AdContext({
    required this.campaignId,
    this.adId,
    this.placement,
    this.partnerId,
  });

  Map<String, dynamic> toJson() => {
        'campaign_id': campaignId,
        if (adId != null) 'ad_id': adId,
        if (placement != null) 'placement': placement,
        if (partnerId != null) 'partner_id': partnerId,
      };
}

/// A single tracked event. Serialises to the ingest envelope documented in
/// docs/EVENT_SCHEMA.md. The tracker fills identity/app/device fields.
class QaroEvent {
  final String eventId;
  final String name;
  final DateTime tsClient;
  final Map<String, dynamic> properties;
  final AdContext? ad;
  final String? screen;

  QaroEvent({
    required this.name,
    this.properties = const {},
    this.ad,
    this.screen,
    DateTime? tsClient,
    String? eventId,
  })  : eventId = eventId ?? _uuid.v4(),
        tsClient = tsClient ?? DateTime.now().toUtc();

  Map<String, dynamic> toEnvelope({
    required String anonymousId,
    required int? customerId,
    required String sessionId,
    required Map<String, dynamic> app,
    required Map<String, dynamic> device,
  }) {
    return {
      'event_id': eventId,
      'event_name': name,
      'ts_client': tsClient.toUtc().toIso8601String(),
      'anonymous_id': anonymousId,
      'customer_id': customerId,
      'session_id': sessionId,
      'app': app,
      'device': device,
      if (screen != null) 'screen': screen,
      if (ad != null) 'ad': ad!.toJson(),
      'properties': properties,
    };
  }
}
