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
    } finally {
      if (mounted) setState(() => _loadingQr = false);
    }
  }

  // Called when the tenant taps Submit — validates form then opens receipt sheet.
  void _onSubmitTapped() {
    if (!_formKey.currentState!.validate()) return;
    _openReceiptSheet();
  }

  Future<void> _openReceiptSheet() async {
    final billing = context.read<BillingProvider>();
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReceiptSheet(
        bill: widget.bill,
        method: _method,
        referenceNumber: _refCtrl.text.trim(),
        billingProvider: billing,
        onSuccess: () {
          toastification.show(
            context: context,
            type: ToastificationType.success,
            style: ToastificationStyle.flat,
            title: const Text('Payment Submitted'),
            description: const Text('Your payment is under review by the admin.'),
            autoCloseDuration: const Duration(seconds: 4),
          );
          Navigator.pop(context); // close PayBillScreen
        },
        onError: (msg) {
          toastification.show(
            context: context,
            type: ToastificationType.error,
            style: ToastificationStyle.flat,
            title: const Text('Submission Failed'),
            description: Text(msg),
            autoCloseDuration: const Duration(seconds: 4),
          );
        },
      ),
    );
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
                ),
              )
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
            const SizedBox(height: 32),

            SizedBox(
              height: 50,
              child: ElevatedButton.icon(
                onPressed: billing.submitting ? null : _onSubmitTapped,
                icon: billing.submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.upload_file),
                label: Text(billing.submitting ? 'Submitting…' : 'Attach Receipt & Submit'),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

// ── Receipt bottom sheet ───────────────────────────────────────────────────────

class _ReceiptSheet extends StatefulWidget {
  final BillingPeriod bill;
  final String method;
  final String referenceNumber;
  final BillingProvider billingProvider;
  final VoidCallback onSuccess;
  final void Function(String) onError;

  const _ReceiptSheet({
    required this.bill,
    required this.method,
    required this.referenceNumber,
    required this.billingProvider,
    required this.onSuccess,
    required this.onError,
  });

  @override
  State<_ReceiptSheet> createState() => _ReceiptSheetState();
}

class _ReceiptSheetState extends State<_ReceiptSheet> {
  final List<File> _images = [];
  bool _submitting = false;
  static const _maxImages = 3;

  Future<void> _pickImage() async {
    if (_images.length >= _maxImages) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
    );
    if (picked != null && mounted) {
      setState(() => _images.add(File(picked.path)));
    }
  }

  void _removeImage(int index) {
    setState(() => _images.removeAt(index));
  }

  Future<void> _confirm() async {
    if (_images.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.billingProvider.submitPayment(
        billingPeriodId: widget.bill.id,
        paymentMethod: widget.method,
        referenceNumber: widget.referenceNumber,
        receiptImages: _images,
      );
      if (mounted) {
        Navigator.pop(context); // close sheet
        widget.onSuccess();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        widget.onError(e.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).viewInsets.bottom +
        MediaQuery.of(context).padding.bottom;
    final canConfirm = _images.isNotEmpty && !_submitting;

    return Container(
      decoration: const BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottomPad + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: kBorderColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Title row
          Row(
            children: [
              const Icon(Icons.receipt_long, color: kPrimaryBlue, size: 20),
              const SizedBox(width: 8),
              const Text(
                'Attach Receipt',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Text(
                '${_images.length}/$_maxImages',
                style: TextStyle(
                  color: _images.isEmpty ? kDanger : kTextMuted,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Minimum 1 image required · Maximum 3',
            style: TextStyle(color: kTextMuted, fontSize: 12),
          ),
          const SizedBox(height: 16),

          // Image slots row
          Row(
            children: [
              // Existing images
              for (int i = 0; i < _images.length; i++) ...[
                _ImageSlot(
                  image: _images[i],
                  onRemove: _submitting ? null : () => _removeImage(i),
                ),
                const SizedBox(width: 10),
              ],
              // Add slot (shown if < 3 images)
              if (_images.length < _maxImages)
                _AddSlot(
                  onTap: _submitting ? null : _pickImage,
                  label: _images.isEmpty ? 'Add receipt' : 'Add more',
                ),
            ],
          ),
          const SizedBox(height: 24),

          // Confirm button
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              onPressed: canConfirm ? _confirm : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: canConfirm ? kPrimaryBlue : kBorderColor,
                disabledBackgroundColor: kBorderColor,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Icon(
                      _images.isEmpty ? Icons.block : Icons.send,
                      color: Colors.white,
                    ),
              label: Text(
                _submitting
                    ? 'Submitting…'
                    : _images.isEmpty
                        ? 'Attach at least 1 image'
                        : 'Confirm Payment',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _ImageSlot extends StatelessWidget {
  final File image;
  final VoidCallback? onRemove;
  const _ImageSlot({required this.image, this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Image.file(
            image,
            width: 88,
            height: 88,
            fit: BoxFit.cover,
          ),
        ),
        Positioned(
          top: 4,
          right: 4,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                  color: kDanger, shape: BoxShape.circle),
              child: const Icon(Icons.close, color: Colors.white, size: 13),
            ),
          ),
        ),
      ],
    );
  }
}

class _AddSlot extends StatelessWidget {
  final VoidCallback? onTap;
  final String label;
  const _AddSlot({this.onTap, required this.label});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 88,
        height: 88,
        decoration: BoxDecoration(
          color: kCardBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: kBorderColor, style: BorderStyle.solid),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.add_photo_alternate_outlined,
                color: kTextMuted, size: 28),
            const SizedBox(height: 4),
            Text(label,
                textAlign: TextAlign.center,
                style: const TextStyle(color: kTextMuted, fontSize: 10)),
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
          border: Border.all(color: selected ? kPrimaryBlue : kBorderColor),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : kTextMuted,
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}
