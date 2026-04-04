class Pad {
  final int id;
  final String name;
  final String? description;
  final int? deviceId;
  final int? tenantId;
  final double ratePerKwh;
  final bool isActive;
  final String? deviceSerial;
  final String? relayStatus;
  final String? lastSeenAt;

  const Pad({
    required this.id,
    required this.name,
    this.description,
    this.deviceId,
    this.tenantId,
    required this.ratePerKwh,
    required this.isActive,
    this.deviceSerial,
    this.relayStatus,
    this.lastSeenAt,
  });

  factory Pad.fromJson(Map<String, dynamic> j) => Pad(
        id: j['id'] as int,
        name: j['name'] as String? ?? '',
        description: j['description'] as String?,
        deviceId: j['device_id'] as int?,
        tenantId: j['tenant_id'] as int?,
        ratePerKwh: (j['rate_per_kwh'] as num?)?.toDouble() ?? 0.0,
        isActive: (j['is_active'] == true || j['is_active'] == 1),
        deviceSerial: j['device_serial'] as String?,
        relayStatus: j['relay_status'] as String?,
        lastSeenAt: j['last_seen_at'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'device_id': deviceId,
        'tenant_id': tenantId,
        'rate_per_kwh': ratePerKwh,
        'is_active': isActive,
        'device_serial': deviceSerial,
        'relay_status': relayStatus,
        'last_seen_at': lastSeenAt,
      };

  bool get hasDevice => deviceId != null;
  bool get isRelayOn => relayStatus == 'on';
  bool get isRelayTripped => relayStatus == 'tripped';

  /// Device is considered online if last seen within 2 minutes
  bool get isDeviceOnline {
    if (lastSeenAt == null) return false;
    final last = DateTime.tryParse(lastSeenAt!);
    if (last == null) return false;
    return DateTime.now().difference(last).inMinutes < 2;
  }
}
