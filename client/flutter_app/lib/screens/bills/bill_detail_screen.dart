import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/constants.dart';
import '../../models/billing_period.dart';
import '../../providers/billing_provider.dart';
import 'pay_bill_screen.dart';

class BillDetailScreen extends StatelessWidget {
  final BillingPeriod bill;

  const BillDetailScreen({super.key, required this.bill});

  @override
  Widget build(BuildContext context) {
    // Use live bill from provider so status updates (SSE approval) reflect here
    final liveBill = context.select<BillingProvider, BillingPeriod>(
      (b) => b.bills.firstWhere((e) => e.id == bill.id, orElse: () => bill),
    );
    final fmt = NumberFormat.currency(symbol: '₱', decimalDigits: 2);
    final dateFmt = DateFormat('MMMM d, yyyy');

    DateTime? startDate, endDate, dueDate, paidAt;
    try {
      startDate = DateTime.parse(liveBill.periodStart);
      endDate = DateTime.parse(liveBill.periodEnd);
      dueDate = DateTime.parse(liveBill.dueDate);
      if (liveBill.paidAt != null) paidAt = DateTime.parse(liveBill.paidAt!);
    } catch (_) {}

    return Scaffold(
      appBar: AppBar(title: const Text('Bill Details')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: kCardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kBorderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Text(
                          'Billing Period',
                          style: Theme.of(context)
                              .textTheme
                              .titleMedium
                              ?.copyWith(color: Colors.white),
                        ),
                        const SizedBox(width: 8),
                        _BillTypeChip(billType: liveBill.billType),
                      ],
                    ),
                    _StatusChip(status: liveBill.status),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  startDate != null && endDate != null
                      ? '${dateFmt.format(startDate)} – ${dateFmt.format(endDate)}'
                      : '${liveBill.periodStart} – ${liveBill.periodEnd}',
                  style: const TextStyle(color: kTextMuted, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Details
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: kCardBg,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: kBorderColor),
            ),
            child: Column(
              children: [
                if (liveBill.isElectricity) ...[
                  _DetailRow(
                    label: 'Energy Used',
                    value: '${liveBill.energyKwh.toStringAsFixed(3)} kWh',
                  ),
                  const Divider(color: kBorderColor, height: 24),
                  _DetailRow(
                    label: 'Rate per kWh',
                    value: fmt.format(liveBill.ratePerKwh),
                  ),
                  const Divider(color: kBorderColor, height: 24),
                ],
                if (liveBill.isRent) ...[
                  _DetailRow(label: 'Type', value: 'Monthly Rent'),
                  const Divider(color: kBorderColor, height: 24),
                ],
                _DetailRow(
                  label: 'Due Date',
                  value: dueDate != null ? dateFmt.format(dueDate) : liveBill.dueDate,
                ),
                if (paidAt != null) ...[
                  const Divider(color: kBorderColor, height: 24),
                  _DetailRow(
                    label: 'Paid On',
                    value: dateFmt.format(paidAt),
                  ),
                ],
                const Divider(color: kBorderColor, height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Total Amount Due',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 15),
                    ),
                    Text(
                      fmt.format(liveBill.amountDue),
                      style: const TextStyle(
                          color: kPrimaryBlue,
                          fontWeight: FontWeight.bold,
                          fontSize: 20),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          if (!liveBill.isPaid && !liveBill.isWaived)
            SizedBox(
              height: 50,
              child: ElevatedButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PayBillScreen(bill: liveBill),
                  ),
                ),
                icon: const Icon(Icons.payment),
                label: const Text('Pay Now'),
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  const _DetailRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: kTextMuted, fontSize: 13)),
        Text(value,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w500)),
      ],
    );
  }
}

class _BillTypeChip extends StatelessWidget {
  final String billType;
  const _BillTypeChip({required this.billType});

  @override
  Widget build(BuildContext context) {
    final isRent = billType == 'rent';
    final color = isRent ? kPurple : kPrimaryBlue;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isRent ? Icons.home_outlined : Icons.bolt_rounded, color: color, size: 12),
          const SizedBox(width: 3),
          Text(
            isRent ? 'Rent' : 'Electricity',
            style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;
    switch (status) {
      case 'paid':
        color = kSuccess;
        label = 'Paid';
        break;
      case 'overdue':
        color = kDanger;
        label = 'Overdue';
        break;
      case 'waived':
        color = kPurple;
        label = 'Waived';
        break;
      default:
        color = kWarning;
        label = 'Unpaid';
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w600)),
    );
  }
}
