import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/pad.dart';
import '../models/power_reading.dart';
import '../services/api_service.dart';
import '../services/connectivity_service.dart';
import '../services/notification_service.dart';
import '../services/sse_service.dart';

class HomeProvider extends ChangeNotifier {
  Pad? _pad;
  PowerReading? _reading;
  bool _loading = true;
  String? _error;
  bool _isOnline = true;
  bool _isLive = false; // true once first SSE power_reading arrives
  DateTime? _lastReadingAt;

  final SseService _sse = SseService();
  StreamSubscription<SseEvent>? _sseSub;
  StreamSubscription<bool>? _connectivitySub;

  Pad? get pad => _pad;
  PowerReading? get reading => _reading;
  bool get loading => _loading;
  String? get error => _error;
  bool get isOnline => _isOnline;
  bool get isLive => _isLive;
  DateTime? get lastReadingAt => _lastReadingAt;
  Stream<SseEvent> get sseStream => _sse.stream;

  HomeProvider() {
    _connectivitySub = ConnectivityService.onConnectivityChanged.listen((online) {
      _isOnline = online;
      notifyListeners();
    });
  }

  Future<void> load() async {
    _loading = true;
    _error = null;
    _isOnline = await ConnectivityService.isConnected();
    notifyListeners();
    try {
      _pad = await ApiService.getMyPad();
      if (_pad!.hasDevice) {
        _reading = await ApiService.getLatestReading(_pad!.deviceId!);
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
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
          _reading = PowerReading(
            id: 0,
            deviceId: _pad!.deviceId!,
            timestamp: DateTime.now().toIso8601String(),
            voltageRms: (event.data['voltage_rms'] as num?)?.toDouble() ?? 0,
            currentRms: (event.data['current_rms'] as num?)?.toDouble() ?? 0,
            powerReal: (event.data['power_real'] as num?)?.toDouble() ?? 0,
            powerApparent: (event.data['power_apparent'] as num?)?.toDouble() ?? 0,
            powerFactor: (event.data['power_factor'] as num?)?.toDouble() ?? 0,
            energyKwh: (event.data['energy_kwh'] as num?)?.toDouble(),
            frequency: (event.data['frequency'] as num?)?.toDouble(),
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
          NotificationService.showAnomalyAlert(
            type: event.data['anomaly_type'] as String? ?? 'unknown',
            severity: event.data['severity'] as String? ?? 'low',
            relayTripped: event.data['relay_tripped'] == true,
          );
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
