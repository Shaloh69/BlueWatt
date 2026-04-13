import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:toastification/toastification.dart';
import '../../config/constants.dart';
import '../../models/billing_period.dart';
import '../../models/payment.dart';
import '../../providers/billing_provider.dart';
import '../../services/api_service.dart';

class PayBillScreen extends StatefulWidget {
  final BillingPeriod bill;
  const PayBillScreen({super.key, required this.bill});

  @override
  State<PayBillScreen> createState() => _PayBillScreenState();
}

class _PayBillScreenState extends State<PayBillScreen> {
  final _formKey = GlobalKey<FormState>();
  final _refCtrl = TextEditingController();
  String _method = 'gcash';
  File? _receipt;
  List<PaymentQrCode> _qrCodes = [];
  bool _loadingQr = true;

  @override
  void initState() {
    super.initState();
    _loadQrCodes();
  }

  @override
  void dispose() {
    _refCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadQrCodes() async {
    // Show cached QR codes immediately (stale-while-revalidate)
    final stale = ApiService.getQrCodesFromCache();
    if (stale.isNotEmpty && mounted) {
      setState(() {
        _qrCodes = stale;
        _loadingQr = false;
      });
    }

    try {
      final codes = await ApiService.getQrCodes();
      if (mounted) setState(() => _qrCodes = codes);
    } catch (_) {
      // Network failed — stale data already shown, nothing more to do
    } finally {
      if (mounted) setState(() => _loadingQr = false);
    }
  }

  Future<void> _pickReceipt() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
    );
    if (picked != null && mounted) {
      setState(() => _receipt = File(picked.path));
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_receipt == null) {
      toastification.show(
        context: context,
        type: ToastificationType.warning,
        style: ToastificationStyle.flat,
        title: const Text('Receipt Required'),
        description: const Text('Please attach your payment receipt.'),
        autoCloseDuration: const Duration(seconds: 3),
      );
      return;
    }

    try {
      await context.read<BillingProvider>().submitPayment(
            billingPeriodId: widget.bill.id,
            paymentMethod: _method,
            referenceNumber: _refCtrl.text.trim(),
            receiptImage: _receipt!,
          );
      if (mounted) {
        toastification.show(
          context: context,
          type: ToastificationType.success,
          style: ToastificationStyle.flat,
          title: const Text('Payment Submitted'),
          description:
              const Text('Your payment is under review by the admin.'),
          autoCloseDuration: const Duration(seconds: 4),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        toastification.show(
          context: context,
          type: ToastificationType.error,
          style: ToastificationStyle.flat,
          title: const Text('Submission Failed'),
          description: Text(e.toString()),
          autoCloseDuration: const Duration(seconds: 4),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(symbol: '₱', decimalDigits: 2);
    final billing = context.watch<BillingProvider>();
    final activeQr = _qrCodes.where((q) => q.isActive).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Pay Bill')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Amount summary
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kPrimaryBlue.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: kPrimaryBlue.withOpacity(0.3)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Amount to Pay',
                      style: TextStyle(color: Colors.white, fontSize: 14)),
                  Text(
                    fmt.format(widget.bill.amountDue),
                    style: const TextStyle(
                        color: kPrimaryBlue,
                        fontWeight: FontWeight.bold,
                        fontSize: 22),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Payment method
            const Text('Payment Method',
                style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
            const SizedBox(height: 10),
            Row(
              children: [
                _MethodChip(
                  label: 'GCash',
                  value: 'gcash',
                  selected: _method == 'gcash',
                  onTap: () => setState(() => _method = 'gcash'),
                ),
                const SizedBox(width: 10),
                _MethodChip(
                  label: 'Maya',
                  value: 'maya',
                  selected: _method == 'maya',
                  onTap: () => setState(() => _method = 'maya'),
                ),
                const SizedBox(width: 10),
                _MethodChip(
                  label: 'Bank',
                  value: 'bank_transfer',
                  selected: _method == 'bank_transfer',
                  onTap: () => setState(() => _method = 'bank_transfer'),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // QR Code
            if (_loadingQr)
              const Center(
                  child: Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: CircularProgressIndicator(),
              ))
            else if (activeQr.isNotEmpty) ...[
              const Text('Scan to Pay',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14)),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: kCardBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: kBorderColor),
                ),
                child: Column(
                  children: activeQr.map((qr) {
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Column(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              qr.imageUrl,
                              width: 180,
                              height: 180,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => Container(
                                width: 180,
                                height: 180,
                                color: kBorderColor,
                                child: const Icon(Icons.qr_code,
                                    color: kTextMuted, size: 60),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(qr.label,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w500)),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 20),
            ],

            // Reference number
            const Text('Reference Number',
                style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
            const SizedBox(height: 10),
            TextFormField(
              controller: _refCtrl,
              decoration: const InputDecoration(
                hintText: 'e.g. 09123456789',
                prefixIcon: Icon(Icons.tag),
              ),
              validator: (v) {
                if (v == null || v.trim().isEmpty) {
                  return 'Reference number is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 20),

            // Receipt upload
            const Text('Payment Receipt',
                style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
            const SizedBox(height: 10),
            GestureDetector(
              onTap: _pickReceipt,
              child: Container(
                height: _receipt == null ? 100 : null,
                decoration: BoxDecoration(
                  color: kCardBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _receipt != null
                        ? kSuccess
                        : kBorderColor,
                    style: BorderStyle.solid,
                  ),
                ),
                child: _receipt == null
                    ? const Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.upload_file,
                              color: kTextMuted, size: 32),
                          SizedBox(height: 8),
                          Text('Tap to upload receipt',
                              style:
                                  TextStyle(color: kTextMuted, fontSize: 13)),
                        ],
                      )
                    : Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.file(
                              _receipt!,
                              width: double.infinity,
                              height: 200,
                              fit: BoxFit.cover,
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: GestureDetector(
                              onTap: () => setState(() => _receipt = null),
                              child: Container(
                                padding: const EdgeInsets.all(4),
                                decoration: const BoxDecoration(
                                  color: kDanger,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.close,
                                    color: Colors.white, size: 16),
                              ),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 32),

            SizedBox(
              height: 50,
              child: ElevatedButton.icon(
                onPressed: billing.submitting ? null : _submit,
                icon: billing.submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send),
                label: Text(billing.submitting ? 'Submitting…' : 'Submit Payment'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _MethodChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;
  const _MethodChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? kPrimaryBlue : kCardBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
              color: selected ? kPrimaryBlue : kBorderColor),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : kTextMuted,
            fontWeight:
                selected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
