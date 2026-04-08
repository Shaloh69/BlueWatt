class BillingPeriod {
  final int id;
  final int padId;
  final int? tenantId;
  final String periodStart;
  final String periodEnd;
  final double energyKwh;
  final double ratePerKwh;
  final double amountDue;
  final String status; // unpaid | paid | overdue | waived
  final String dueDate;
  final String? paidAt;
  final String? padName;

  const BillingPeriod({
    required this.id,
    required this.padId,
    this.tenantId,
    required this.periodStart,
    required this.periodEnd,
    required this.energyKwh,
    required this.ratePerKwh,
    required this.amountDue,
    required this.status,
    required this.dueDate,
    this.paidAt,
    this.padName,
  });

  static double _d(dynamic v) =>
      v == null ? 0.0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0);

  factory BillingPeriod.fromJson(Map<String, dynamic> j) => BillingPeriod(
        id: j['id'] as int,
        padId: j['pad_id'] as int? ?? 0,
        tenantId: j['tenant_id'] as int?,
        periodStart: j['period_start'] as String? ?? '',
        periodEnd: j['period_end'] as String? ?? '',
        energyKwh: _d(j['energy_kwh']),
        ratePerKwh: _d(j['rate_per_kwh']),
        amountDue: _d(j['amount_due']),
        status: j['status'] as String? ?? 'unpaid',
        dueDate: j['due_date'] as String? ?? '',
        paidAt: j['paid_at'] as String?,
        padName: j['pad_name'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'pad_id': padId,
        'tenant_id': tenantId,
        'period_start': periodStart,
        'period_end': periodEnd,
        'energy_kwh': energyKwh,
        'rate_per_kwh': ratePerKwh,
        'amount_due': amountDue,
        'status': status,
        'due_date': dueDate,
        'paid_at': paidAt,
        'pad_name': padName,
      };

  bool get isPaid => status == 'paid';
  bool get isOverdue => status == 'overdue';
  bool get isWaived => status == 'waived';
  bool get isUnpaid => status == 'unpaid';
}
