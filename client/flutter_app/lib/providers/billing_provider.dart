import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/billing_period.dart';
import '../models/payment.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/sse_service.dart';

class BillingProvider extends ChangeNotifier {
  List<BillingPeriod> _bills = [];
  bool _loading = true;
  String? _error;
  bool _submitting = false;

  List<BillingPeriod> get bills => _bills;
  bool get loading => _loading;
  String? get error => _error;
  bool get submitting => _submitting;

  BillingPeriod? get unpaidBill {
    try {
      return _bills.firstWhere((b) => !b.isPaid);
    } catch (_) {
      return null;
    }
  }

  StreamSubscription<SseEvent>? _sseSub;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _bills = await ApiService.getMyBills();
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void listenSSE(Stream<SseEvent> stream) {
    _sseSub?.cancel();
    _sseSub = stream.listen(_handleSseEvent);
  }

  void _handleSseEvent(SseEvent event) {
    switch (event.type) {
      case 'payment_received':
        // Refresh bills so status updates
        load();
        break;

      case 'payment_approved':
        NotificationService.showPaymentApproved();
        load();
        break;

      case 'payment_rejected':
        final reason = event.data['reason'] as String?;
        NotificationService.showPaymentRejected(reason);
        load();
        break;
    }
  }

  Future<void> submitPayment({
    required int billingPeriodId,
    required String paymentMethod,
    required String referenceNumber,
    required File receiptImage,
  }) async {
    _submitting = true;
    notifyListeners();
    try {
      await ApiService.submitPayment(
        billingPeriodId: billingPeriodId,
        paymentMethod: paymentMethod,
        referenceNumber: referenceNumber,
        receiptImage: receiptImage,
      );
      await load();
    } finally {
      _submitting = false;
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _sseSub?.cancel();
    super.dispose();
  }
}
