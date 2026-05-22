import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/constants.dart';
import '../../providers/billing_provider.dart';
import '../../widgets/bill_card.dart';
import 'bill_detail_screen.dart';

class BillsScreen extends StatelessWidget {
  const BillsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Bills'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<BillingProvider>().load(),
          ),
        ],
      ),
      body: Consumer<BillingProvider>(
        builder: (context, billing, _) {
          if (billing.loading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (billing.error != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: kDanger, size: 48),
                    const SizedBox(height: 16),
                    Text(billing.error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: kTextMuted)),
                    const SizedBox(height: 20),
                    ElevatedButton.icon(
                      onPressed: billing.load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            );
          }
          if (billing.bills.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.receipt_long_outlined,
                      color: kTextMuted, size: 56),
                  SizedBox(height: 16),
                  Text('No bills yet.',
                      style: TextStyle(color: kTextMuted, fontSize: 15)),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: billing.load,
            color: kPrimaryBlue,
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: billing.bills.length + 1,
              separatorBuilder: (_, i) =>
                  i == 0 ? const SizedBox(height: 12) : const SizedBox(height: 10),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: kPrimaryBlue.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: kPrimaryBlue.withOpacity(0.2)),
                    ),
                    child: const Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, color: kPrimaryBlue, size: 16),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Unpaid bills remain as "Unpaid" until the end of the billing period. After that, they become "Overdue".',
                            style: TextStyle(color: kPrimaryBlue, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  );
                }
                final bill = billing.bills[i - 1];
                return BillCard(
                  bill: bill,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => BillDetailScreen(bill: bill),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
