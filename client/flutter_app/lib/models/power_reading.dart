class PowerReading {
  final int id;
  final int deviceId;
  final String timestamp;
  final double voltageRms;
  final double currentRms;
  final double powerReal;
  final double powerApparent;
  final double powerFactor;
  final double? energyKwh;
  final double? frequency;

  const PowerReading({
    required this.id,
    required this.deviceId,
    required this.timestamp,
    required this.voltageRms,
    required this.currentRms,
    required this.powerReal,
    required this.powerApparent,
    required this.powerFactor,
    this.energyKwh,
    this.frequency,
  });

  factory PowerReading.fromJson(Map<String, dynamic> j) => PowerReading(
        id: j['id'] as int? ?? 0,
        deviceId: j['device_id'] as int? ?? 0,
        timestamp: j['timestamp'] as String? ?? '',
        voltageRms: (j['voltage_rms'] as num?)?.toDouble() ?? 0.0,
        currentRms: (j['current_rms'] as num?)?.toDouble() ?? 0.0,
        powerReal: (j['power_real'] as num?)?.toDouble() ?? 0.0,
        powerApparent: (j['power_apparent'] as num?)?.toDouble() ?? 0.0,
        powerFactor: (j['power_factor'] as num?)?.toDouble() ?? 0.0,
        energyKwh: (j['energy_kwh'] as num?)?.toDouble(),
        frequency: (j['frequency'] as num?)?.toDouble(),
      );

  // Convenience: watts formatted
  String get wattsLabel => '${powerReal.toStringAsFixed(1)} W';
  String get voltageLabel => '${voltageRms.toStringAsFixed(1)} V';
  String get currentLabel => '${currentRms.toStringAsFixed(2)} A';
  String get energyLabel => energyKwh != null ? '${energyKwh!.toStringAsFixed(3)} kWh' : '—';
  String get freqLabel => frequency != null ? '${frequency!.toStringAsFixed(1)} Hz' : '—';
  String get pfLabel => powerFactor.toStringAsFixed(2);
}
