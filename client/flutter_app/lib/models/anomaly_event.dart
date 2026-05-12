class AnomalyEvent {
  final int id;
  final int deviceId;
  final String anomalyType;
  final String severity;
  final bool relayTripped;
  final bool isResolved;
  final String timestamp;
  final double? currentValue;
  final double? voltageValue;
  final double? powerValue;

  const AnomalyEvent({
    required this.id,
    required this.deviceId,
    required this.anomalyType,
    required this.severity,
    required this.relayTripped,
    required this.isResolved,
    required this.timestamp,
    this.currentValue,
    this.voltageValue,
    this.powerValue,
  });

  static int _i(dynamic v) =>
      v == null ? 0 : (v is int ? v : int.tryParse(v.toString()) ?? 0);
  static double? _dNull(dynamic v) =>
      v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

  factory AnomalyEvent.fromJson(Map<String, dynamic> j) => AnomalyEvent(
        id: _i(j['id']),
        deviceId: _i(j['device_id']),
        anomalyType: j['anomaly_type'] as String? ?? '',
        severity: j['severity'] as String? ?? 'low',
        relayTripped: j['relay_tripped'] == true || j['relay_tripped'] == 1,
        isResolved: j['is_resolved'] == true || j['is_resolved'] == 1,
        timestamp: j['timestamp'] as String? ?? '',
        currentValue: _dNull(j['current_value']),
        voltageValue: _dNull(j['voltage_value']),
        powerValue: _dNull(j['power_value']),
      );

  AnomalyEvent copyWithResolved() => AnomalyEvent(
        id: id,
        deviceId: deviceId,
        anomalyType: anomalyType,
        severity: severity,
        relayTripped: relayTripped,
        isResolved: true,
        timestamp: timestamp,
        currentValue: currentValue,
        voltageValue: voltageValue,
        powerValue: powerValue,
      );

  bool get isCritical => severity == 'critical';
  bool get isHigh => severity == 'high';

  String get typeLabel => anomalyType
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}
