import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/constants.dart';
import '../../providers/home_provider.dart';
import '../../providers/billing_provider.dart';
import '../../widgets/metric_card.dart';
import '../../widgets/relay_status_badge.dart';
import '../bills/bill_detail_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Home'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<HomeProvider>().load(),
          ),
        ],
      ),
      body: Consumer<HomeProvider>(
        builder: (context, home, _) {
          if (home.loading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (home.error != null) {
            return _ErrorView(
              message: home.error!,
              onRetry: home.load,
            );
          }
          final pad = home.pad;
          if (pad == null) {
            return const Center(
              child: Text(
                'No pad assigned to your account.',
                style: TextStyle(color: kTextMuted),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: home.load,
            color: kPrimaryBlue,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Pad info header
                Container(
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
                          color: kPrimaryBlue.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.home_work_outlined,
                            color: kPrimaryBlue, size: 24),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              pad.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 15,
                              ),
                            ),
                            if (pad.description != null)
                              Text(
                                pad.description!,
                                style: const TextStyle(
                                    color: kTextMuted, fontSize: 12),
                              ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          RelayStatusBadge(status: pad.relayStatus),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6, height: 6,
                                decoration: BoxDecoration(
                                  color: pad.isDeviceOnline ? kSuccess : kTextMuted,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                pad.isDeviceOnline ? 'ESP Online' : 'ESP Offline',
                                style: TextStyle(
                                  fontSize: 10,
                                  color: pad.isDeviceOnline ? kSuccess : kTextMuted,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Live metrics or no-device placeholder
                if (!pad.hasDevice)
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: kCardBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: kBorderColor),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.sensors_off, color: kTextMuted, size: 40),
                        SizedBox(height: 12),
                        Text(
                          'No device assigned yet',
                          style: TextStyle(color: kTextMuted),
                        ),
                      ],
                    ),
                  )
                else ...[
                  Row(
                    children: [
                      const Text(
                        'Live Readings',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 15),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: home.isLive ? kSuccess : kTextMuted,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        home.isLive ? 'Live' : 'Connecting…',
                        style: TextStyle(
                          color: home.isLive ? kSuccess : kTextMuted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (home.reading == null)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 20),
                        child: Text(
                          'Waiting for first reading…',
                          style: TextStyle(color: kTextMuted),
                        ),
                      ),
                    )
                  else
                    _MetricsGrid(home: home),
                ],
                const SizedBox(height: 20),

                // Billing summary
                Consumer<BillingProvider>(
                  builder: (context, billing, _) {
                    final unpaid = billing.unpaidBill;
                    if (unpaid == null) return const SizedBox.shrink();
                    final fmt = NumberFormat.currency(
                        symbol: '₱', decimalDigits: 2);
                    return GestureDetector(
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => BillDetailScreen(bill: unpaid),
                        ),
                      ),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: kWarning.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: kWarning.withOpacity(0.4)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.warning_amber_rounded,
                                color: kWarning, size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Unpaid Bill',
                                    style: TextStyle(
                                        color: kWarning,
                                        fontWeight: FontWeight.w600,
                                        fontSize: 13),
                                  ),
                                  Text(
                                    fmt.format(unpaid.amountDue),
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 18),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right,
                                color: kWarning),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  final HomeProvider home;
  const _MetricsGrid({required this.home});

  @override
  Widget build(BuildContext context) {
    final r = home.reading!;
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.35,
      children: [
        MetricCard(
          label: 'Voltage',
          value: r.voltageRms.toStringAsFixed(1),
          unit: 'V',
          icon: Icons.electric_bolt,
          iconColor: kWarning,
        ),
        MetricCard(
          label: 'Current',
          value: r.currentRms.toStringAsFixed(2),
          unit: 'A',
          icon: Icons.waves,
          iconColor: kPrimaryBlue,
        ),
        MetricCard(
          label: 'Power',
          value: r.powerReal.toStringAsFixed(1),
          unit: 'W',
          icon: Icons.power,
          iconColor: kSuccess,
        ),
        MetricCard(
          label: 'Apparent',
          value: r.powerApparent.toStringAsFixed(1),
          unit: 'VA',
          icon: Icons.show_chart,
          iconColor: kPurple,
        ),
        MetricCard(
          label: 'Power Factor',
          value: r.powerFactor.toStringAsFixed(2),
          unit: '',
          icon: Icons.speed,
          iconColor: kPrimaryBlue,
        ),
        MetricCard(
          label: 'Energy',
          value: (r.energyKwh ?? 0).toStringAsFixed(3),
          unit: 'kWh',
          icon: Icons.battery_charging_full,
          iconColor: kSuccess,
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: kDanger, size: 48),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: kTextMuted),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
