import 'dart:convert';
import 'package:http/http.dart' as http;
import 'config.dart';

/// Thin HTTP sender for a batch of event envelopes. Never throws — returns
/// false on any failure so the tracker keeps the batch buffered for retry.
class Transport {
  Transport(this.config);
  final QaroTrackerConfig config;

  Future<bool> send(
    List<Map<String, dynamic>> events, {
    String? authToken,
  }) async {
    if (events.isEmpty) return true;
    try {
      final res = await http
          .post(
            config.eventsUri,
            headers: {
              'Content-Type': 'application/json',
              'X-QARO-App-Key': config.appKey,
              if (authToken != null && authToken.isNotEmpty)
                'Authorization': authToken,
            },
            body: jsonEncode({
              'sent_at': DateTime.now().toUtc().toIso8601String(),
              'events': events,
            }),
          )
          .timeout(const Duration(seconds: 15));
      // 2xx = accepted. 4xx (bad batch) we also treat as "done" so a poison
      // batch can't block the queue forever; 5xx/timeout → retry.
      return res.statusCode >= 200 && res.statusCode < 500;
    } catch (_) {
      return false;
    }
  }
}
