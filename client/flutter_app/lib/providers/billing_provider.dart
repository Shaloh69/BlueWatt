import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import '../models/billing_period.dart';
import '../models/payment.dart';
import '../services/api_service.dart';
import '../services/app_cache.dart';
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
    // Show cached bills immediately
    final cached = AppCache.getStale('billing:my');
    if (cached != null && _bills.isEmpty) {
      try {
        final list = (cached['bills'] as List?)
            ?.map((e) => BillingPeriod.fromJson(e as Map<String, dynamic>))
            .toList() ?? [];
        if (list.isNotEmpty) {
          _bills = list;
          _loading = false;
          notifyListeners();
        }
      } catch (_) {}
    }

    if (_bills.isEmpty) {
      _loading = true;
      notifyListeners();
    }

    _error = null;
    try {
      _bills = await ApiService.getMyBills();
      await AppCache.set('billing:my', {
        'bills': _bills.map((b) => b.toJson()).toList(),
      });
    } catch (e) {
      if (_bills.isEmpty) _error = e.toString();
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
        // Admin approved payment — show notification and refresh
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
