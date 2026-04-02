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

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'] as int,
        billingPeriodId: j['billing_period_id'] as int? ?? 0,
        tenantId: j['tenant_id'] as int? ?? 0,
        amount: (j['amount'] as num?)?.toDouble() ?? 0.0,
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
