import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/constants.dart';
import '../models/billing_period.dart';

class BillCard extends StatelessWidget {
  final BillingPeriod bill;
  final VoidCallback? onTap;

  const BillCard({super.key, required this.bill, this.onTap});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat.currency(symbol: '₱', decimalDigits: 2);
    final dateFmt = DateFormat('MMM d, yyyy');

    DateTime? startDate;
    DateTime? endDate;
    try {
      startDate = DateTime.parse(bill.periodStart);
      endDate = DateTime.parse(bill.periodEnd);
    } catch (_) {}

    Color statusColor;
    String statusLabel;
    if (bill.isPaid) {
      statusColor = kSuccess;
      statusLabel = 'Paid';
    } else if (bill.status == 'overdue') {
      statusColor = kDanger;
      statusLabel = 'Overdue';
    } else if (bill.status == 'waived') {
      statusColor = kPurple;
      statusLabel = 'Waived';
    } else {
      statusColor = kWarning;
      statusLabel = 'Unpaid';
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: kCardBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: kBorderColor),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                bill.isRent ? Icons.home_outlined : Icons.bolt_rounded,
                color: statusColor,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: (bill.isRent ? kPurple : kPrimaryBlue).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          bill.isRent ? 'Rent' : 'Electricity',
                          style: TextStyle(
                            color: bill.isRent ? kPurple : kPrimaryBlue,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    startDate != null && endDate != null
                        ? '${dateFmt.format(startDate)} – ${dateFmt.format(endDate)}'
                        : '${bill.periodStart} – ${bill.periodEnd}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                        fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    bill.isElectricity
                        ? '${bill.energyKwh.toStringAsFixed(2)} kWh'
                        : 'Monthly rent',
                    style: const TextStyle(color: kTextMuted, fontSize: 12),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  fmt.format(bill.amountDue),
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
