class Payment {
  final int id;
  final int billingPeriodId;
  final int tenantId;
  final double amount;
  final String? paymentMethod;
  final String status;
  final String? referenceNumber;
  final String? receiptUrl;
  final String? rejectionReason;
  final String? verifiedAt;
  final String createdAt;

  const Payment({
    required this.id,
    required this.billingPeriodId,
    required this.tenantId,
    required this.amount,
    this.paymentMethod,
    required this.status,
    this.referenceNumber,
    this.receiptUrl,
    this.rejectionReason,
    this.verifiedAt,
    required this.createdAt,
  });

  static double _d(dynamic v) =>
      v == null ? 0.0 : (v is num ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0);
  static int _i(dynamic v) =>
      v == null ? 0 : (v is int ? v : int.tryParse(v.toString()) ?? 0);

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: _i(j['id']),
        billingPeriodId: _i(j['billing_period_id']),
        tenantId: _i(j['tenant_id']),
        amount: _d(j['amount']),
        paymentMethod: j['payment_method'] as String?,
        status: j['status'] as String? ?? 'pending',
        referenceNumber: j['reference_number'] as String?,
        receiptUrl: j['receipt_url'] as String?,
        rejectionReason: j['rejection_reason'] as String?,
        verifiedAt: j['verified_at'] as String?,
        createdAt: j['created_at'] as String? ?? '',
      );
}

class PaymentQrCode {
  final int id;
  final String label;
  final String imageUrl;
  final bool isActive;

  const PaymentQrCode({
    required this.id,
    required this.label,
    required this.imageUrl,
    required this.isActive,
  });

  factory PaymentQrCode.fromJson(Map<String, dynamic> j) => PaymentQrCode(
        id: j['id'] as int,
        label: j['label'] as String? ?? '',
        imageUrl: j['image_url'] as String? ?? '',
        isActive: j['is_active'] == true || j['is_active'] == 1,
      );
}
