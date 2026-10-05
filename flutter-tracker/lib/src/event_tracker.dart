import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';
import 'event.dart';
import 'event_buffer.dart';
import 'identity.dart';
import 'transport.dart';

/// The one event tracker. Call [QaroTracker.instance.init] once at app start,
/// then [track] (or the typed helpers) anywhere. Events are enriched with
/// identity/session/app/device, queued, persisted for offline durability, and
/// flushed in batches.
class QaroTracker with WidgetsBindingObserver {
  QaroTracker._();
  static final QaroTracker instance = QaroTracker._();

  late QaroTrackerConfig _config;
  late Transport _transport;
  EventBuffer? _buffer;
  late SessionManager _session;

  String _anonymousId = '';
  int? _customerId;
  String Function()? _authToken;
  String? _currentScreen;

  final List<Map<String, dynamic>> _pending = [];
  Timer? _timer;
  bool _initialized = false;
  bool _flushing = false;

  /// Initialise once. [authToken] lets the tracker read the current customer
  /// token lazily (so logins/logouts are picked up); [customerId] seeds the id.
  Future<void> init(
    QaroTrackerConfig config, {
    String Function()? authToken,
    int? customerId,
  }) async {
    if (_initialized) return;
    _config = config;
    _transport = Transport(config);
    _authToken = authToken;
    _customerId = customerId;
    _session = SessionManager(config.sessionTimeout);
    _initialized = true;

    if (!config.enabled) return;

    final prefs = await SharedPreferences.getInstance();
    _anonymousId = await AnonymousId.load(prefs);
    _buffer = EventBuffer(prefs, config.maxBuffer);
    _pending.addAll(_buffer!.load()); // replay anything unsent from last run

    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(config.flushInterval, (_) => flush());

    track('session_start');
    track('app_open');
    unawaited(flush());
  }

  /// Update the logged-in customer id (call on login / logout).
  void setCustomer(int? id) => _customerId = id;

  /// Set by the route observer; used as the default `screen` on events.
  void setCurrentScreen(String? screen) => _currentScreen = screen;

  /// Track an event. [name] must be in the taxonomy (see docs/EVENT_SCHEMA.md).
  void track(
    String name, {
    Map<String, dynamic> properties = const {},
    AdContext? ad,
    String? screen,
  }) {
    if (!_initialized || !_config.enabled) return;
    final (sid, _) = _session.touch();
    final envelope = QaroEvent(
      name: name,
      properties: properties,
      ad: ad,
      screen: screen ?? _currentScreen,
    ).toEnvelope(
      anonymousId: _anonymousId,
      customerId: _customerId,
      sessionId: sid,
      app: {
        'name': _config.appName,
        'version': _config.appVersion,
        'build': _config.appBuild,
        'platform': _config.platform,
      },
      device: {
        'model': _config.deviceModel,
        'os_version': _config.osVersion,
        'locale': _config.locale,
      },
    );
    _pending.add(envelope);
    if (_pending.length >= _config.batchSize) unawaited(flush());
  }

  /// Send queued events. Safe to call often; no-op while already flushing or empty.
  Future<void> flush() async {
    if (!_config.enabled || _flushing || _pending.isEmpty) return;
    _flushing = true;
    try {
      // Send a chunk from the front; new events accrue at the back meanwhile.
      final take = (_config.batchSize * 5).clamp(1, 500);
      final batch = _pending.take(take).toList();
      final ok = await _transport.send(batch, authToken: _authToken?.call());
      if (ok) _pending.removeRange(0, batch.length);
      await _persist();
    } finally {
      _flushing = false;
    }
  }

  Future<void> _persist() async => _buffer?.save(_pending);

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      track('app_background');
      unawaited(_persist());
      unawaited(flush());
    }
  }

  void dispose() {
    _timer?.cancel();
    if (_config.enabled) WidgetsBinding.instance.removeObserver(this);
  }
}
