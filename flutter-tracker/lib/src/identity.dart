import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

const _kAnonId = 'qaro_tracker_anon_id';
const _uuid = Uuid();

/// Stable, device-scoped id. Created once and persisted; survives logout so a
/// guest who later signs in can be stitched to their customer_id.
class AnonymousId {
  static Future<String> load(SharedPreferences prefs) async {
    var id = prefs.getString(_kAnonId);
    if (id == null || id.isEmpty) {
      id = _uuid.v4();
      await prefs.setString(_kAnonId, id);
    }
    return id;
  }
}

/// Session id, rotated after inactivity or time in background.
class SessionManager {
  SessionManager(this._timeout);
  final Duration _timeout;

  String _id = _uuid.v4();
  DateTime _lastActivity = DateTime.now();

  /// Returns the current session id, minting a fresh one if the previous
  /// session has gone idle past [_timeout]. Returns (id, isNew).
  (String, bool) touch() {
    final now = DateTime.now();
    var isNew = false;
    if (now.difference(_lastActivity) > _timeout) {
      _id = _uuid.v4();
      isNew = true;
    }
    _lastActivity = now;
    return (_id, isNew);
  }

  /// Force a new session (e.g. on cold start).
  String renew() {
    _id = _uuid.v4();
    _lastActivity = DateTime.now();
    return _id;
  }
}
