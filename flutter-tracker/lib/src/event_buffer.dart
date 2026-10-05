import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

const _kBuffer = 'qaro_tracker_buffer';

/// Durable store for unsent event envelopes, backed by SharedPreferences so
/// events survive app restarts and offline periods. Holds a JSON array of
/// enriched envelope maps; the tracker owns the in-memory working copy.
class EventBuffer {
  EventBuffer(this._prefs, this._max);
  final SharedPreferences _prefs;
  final int _max;

  List<Map<String, dynamic>> load() {
    final raw = _prefs.getString(_kBuffer);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(List<Map<String, dynamic>> events) async {
    // Keep only the newest [_max] if we've backed up (offline for a long time).
    final trimmed = events.length > _max
        ? events.sublist(events.length - _max)
        : events;
    try {
      await _prefs.setString(_kBuffer, jsonEncode(trimmed));
    } catch (_) {
      // best-effort; never throw from the tracker
    }
  }

  Future<void> clear() async {
    try {
      await _prefs.remove(_kBuffer);
    } catch (_) {}
  }
}
