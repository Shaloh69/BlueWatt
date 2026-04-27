import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/pad.dart';
import '../models/power_reading.dart';
import '../services/api_service.dart';
import '../services/app_cache.dart';
import '../services/connectivity_service.dart';
import '../services/notification_service.dart';
import '../services/sse_service.dart';

class HomeProvider extends ChangeNotifier {
  Pad? _pad;
  PowerReading? _reading;
  List<Map<String, dynamic>> _dailyRows = [];
  bool _loading = true;
  String? _error;
  bool _isOnline = true;
  bool _isLive = false; // true once first SSE power_reading arrives
  DateTime? _lastReadingAt;
  bool _relayBusy = false;

  final SseService _sse = SseService();
  StreamSubscription<SseEvent>? _sseSub;
  StreamSubscription<bool>? _connectivitySub;

  Pad? get pad => _pad;
  PowerReading? get reading => _reading;
  List<Map<String, dynamic>> get dailyRows => _dailyRows;
  bool get loading => _loading;
  String? get error => _error;
  bool get isOnline => _isOnline;
  bool get isLive => _isLive;
  DateTime? get lastReadingAt => _lastReadingAt;
  bool get relayBusy => _relayBusy;
  Stream<SseEvent> get sseStream => _sse.stream;

  HomeProvider() {
    _connectivitySub = ConnectivityService.onConnectivityChanged.listen((online) {
      _isOnline = online;
      notifyListeners();
    });
  }

  Future<void> load({int? userId}) async {
    _isOnline = await ConnectivityService.isConnected();

    final cacheKey = userId != null ? 'home:pad:$userId' : 'home:pad';

    // Show cached data immediately so the screen isn't blank while fetching
    final cachedPadJson = AppCache.getStale(cacheKey);
    if (cachedPadJson != null && _pad == null) {
      try {
        _pad = Pad.fromJson(cachedPadJson);
        _loading = false; // show content while refreshing in background
        notifyListeners();
      } catch (_) {}
    } else {
      _loading = true;
      notifyListeners();
    }

    _error = null;
    try {
      _pad = await ApiService.getMyPad();
      await AppCache.set(cacheKey, _pad!.toJson());
      if (_pad!.hasDevice) {
        _reading = await ApiService.getLatestReading(_pad!.deviceId!);
        _dailyRows = await ApiService.getAllDailyReport(_pad!.deviceId!);
      }
    } catch (e) {
      if (_pad == null) _error = e.toString();
      // If we have stale data, silently fail so the cached view stays up
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<String?> disablePad() => _sendRelay('off');
  Future<String?> enablePad() => _sendRelay('on');

  Future<String?> _sendRelay(String command) async {
    if (_relayBusy) return null;
    _relayBusy = true;
    notifyListeners();
    try {
      await ApiService.sendRelayCommand(command);
      if (_pad != null) {
        _pad = Pad(
          id: _pad!.id,
          name: _pad!.name,
          description: _pad!.description,
          deviceId: _pad!.deviceId,
          tenantId: _pad!.tenantId,
          ratePerKwh: _pad!.ratePerKwh,
          isActive: _pad!.isActive,
          deviceSerial: _pad!.deviceSerial,
          relayStatus: command,
          lastSeenAt: _pad!.lastSeenAt,
        );
      }
      notifyListeners();
      return null;
    } catch (e) {
      return e.toString();
    } finally {
      _relayBusy = false;
      notifyListeners();
    }
  }

  void connectSSE(String token) {
    _sse.connect(token);
    _sseSub = _sse.stream.listen(_handleSseEvent);
  }

  void _handleSseEvent(SseEvent event) {
    switch (event.type) {
      case 'power_reading':
        final deviceId = event.data['device_id'];
        if (_pad?.deviceId != null && deviceId == _pad!.deviceId) {
          final now = DateTime.now().toIso8601String();
          _reading = PowerReading(
            id: 0,
            deviceId: _pad!.deviceId!,
            timestamp: now,
            voltageRms: (event.data['voltage_rms'] as num?)?.toDouble() ?? 0,
            currentRms: (event.data['current_rms'] as num?)?.toDouble() ?? 0,
            powerReal: (event.data['power_real'] as num?)?.toDouble() ?? 0,
            powerApparent: (event.data['power_apparent'] as num?)?.toDouble() ?? 0,
            powerFactor: (event.data['power_factor'] as num?)?.toDouble() ?? 0,
            energyKwh: (event.data['energy_kwh'] as num?)?.toDouble(),
            frequency: (event.data['frequency'] as num?)?.toDouble(),
          );
          // Update lastSeenAt so isDeviceOnline reflects live data arriving
          _pad = Pad(
            id: _pad!.id,
            name: _pad!.name,
            description: _pad!.description,
            deviceId: _pad!.deviceId,
            tenantId: _pad!.tenantId,
            ratePerKwh: _pad!.ratePerKwh,
            isActive: _pad!.isActive,
            deviceSerial: _pad!.deviceSerial,
            relayStatus: _pad!.relayStatus,
            lastSeenAt: now,
          );
          _isLive = true;
          _lastReadingAt = DateTime.now();
          notifyListeners();
        }
        break;

      case 'relay_state':
        final deviceId = event.data['device_id'];
        if (_pad?.deviceId != null && deviceId == _pad!.deviceId) {
          final newStatus = event.data['relay_status'] as String?;
          if (newStatus != null && _pad != null) {
            _pad = Pad(
              id: _pad!.id,
              name: _pad!.name,
              description: _pad!.description,
              deviceId: _pad!.deviceId,
              tenantId: _pad!.tenantId,
              ratePerKwh: _pad!.ratePerKwh,
              isActive: _pad!.isActive,
              deviceSerial: _pad!.deviceSerial,
              relayStatus: newStatus,
              lastSeenAt: _pad!.lastSeenAt,
            );
            NotificationService.showRelayStateChange(newStatus);
            notifyListeners();
          }
        }
        break;

      case 'anomaly':
        final deviceId = event.data['device_id'];
        if (_pad?.deviceId != null && deviceId == _pad!.deviceId) {
          final relayTripped = event.data['relay_tripped'] == true;
          NotificationService.showAnomalyAlert(
            type: event.data['anomaly_type'] as String? ?? 'unknown',
            severity: event.data['severity'] as String? ?? 'low',
            relayTripped: relayTripped,
          );
          if (relayTripped && _pad != null) {
            _pad = Pad(
              id: _pad!.id,
              name: _pad!.name,
              description: _pad!.description,
              deviceId: _pad!.deviceId,
              tenantId: _pad!.tenantId,
              ratePerKwh: _pad!.ratePerKwh,
              isActive: _pad!.isActive,
              deviceSerial: _pad!.deviceSerial,
              relayStatus: 'tripped',
              lastSeenAt: _pad!.lastSeenAt,
            );
            notifyListeners();
          }
        }
        break;
    }
  }

  void disconnectSSE() {
    _sseSub?.cancel();
    _sse.disconnect();
    _isLive = false;
  }

  @override
  void dispose() {
    disconnectSSE();
    _sse.dispose();
    _connectivitySub?.cancel();
    super.dispose();
  }
}
