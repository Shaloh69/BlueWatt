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

  factory AnomalyEvent.fromJson(Map<String, dynamic> j) => AnomalyEvent(
        id: j['id'] as int? ?? 0,
        deviceId: j['device_id'] as int? ?? 0,
        anomalyType: j['anomaly_type'] as String? ?? '',
        severity: j['severity'] as String? ?? 'low',
        relayTripped: j['relay_tripped'] == true || j['relay_tripped'] == 1,
        isResolved: j['is_resolved'] == true || j['is_resolved'] == 1,
        timestamp: j['timestamp'] as String? ?? '',
        currentValue: (j['current_value'] as num?)?.toDouble(),
        voltageValue: (j['voltage_value'] as num?)?.toDouble(),
        powerValue: (j['power_value'] as num?)?.toDouble(),
      );

  bool get isCritical => severity == 'critical';
  bool get isHigh => severity == 'high';

  String get typeLabel => anomalyType
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}
