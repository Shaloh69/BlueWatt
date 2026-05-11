import 'dart:async';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/constants.dart';
import '../../providers/home_provider.dart';
import '../../services/api_service.dart';
import '../../services/sse_service.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  List<Map<String, dynamic>> _daily = [];
  bool _loading = true;
  String? _error;
  double _todayEnergy = 0;
  String _month = DateFormat('yyyy-MM').format(DateTime.now());
  int? _loadedForDeviceId; // tracks which device we last loaded for

  StreamSubscription<SseEvent>? _sseSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  /// Re-runs whenever HomeProvider notifies. If the pad's deviceId becomes
  /// available after the initial load (race with MainShell._init), trigger a
  /// fresh data fetch so the screen doesn't stay permanently empty.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final deviceId = Provider.of<HomeProvider>(context).pad?.deviceId;
    if (deviceId != null && deviceId != _loadedForDeviceId && !_loading) {
      _loadedForDeviceId = deviceId;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
  }

  Future<void> _init() async {
    await _load();
    if (!mounted) return;
    final home = context.read<HomeProvider>();
    _sseSub = home.sseStream.listen(_onSse);
  }

  void _onSse(SseEvent event) {
    if (event.type != 'power_reading') return;
    final home = context.read<HomeProvider>();
    final deviceId = event.data['device_id'];
    if (home.pad?.deviceId == null || deviceId != home.pad!.deviceId) return;

    // Only refresh today's energy when viewing the current month.
    // energy_kwh from SSE is the cumulative PZEM total, not today's delta —
    // so we re-fetch the actual daily delta from the API.
    final currentMonth = DateFormat('yyyy-MM').format(DateTime.now());
    if (_month != currentMonth) return;

    ApiService.getTodayEnergy(home.pad!.deviceId!).then((kwh) {
      if (!mounted) return;
      setState(() { _todayEnergy = kwh; });
    }).catchError((_) {});
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final home = context.read<HomeProvider>();
      final deviceId = home.pad?.deviceId;
      if (deviceId == null) {
        setState(() { _loading = false; _daily = []; });
        return;
      }
      _loadedForDeviceId = deviceId;
      final results = await Future.wait([
        ApiService.getDailyReport(deviceId, month: _month),
        ApiService.getTodayEnergy(deviceId),
      ]);
      setState(() {
        _daily = results[0] as List<Map<String, dynamic>>;
        _todayEnergy = results[1] as double;
      });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  void dispose() {
    _sseSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final months = _buildMonthOptions();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  color: kPrimaryBlue,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Month picker
                      _MonthPicker(
                        months: months,
                        selected: _month,
                        onChanged: (m) { setState(() { _month = m; }); _load(); },
                      ),
                      const SizedBox(height: 16),

                      // Today energy card — only relevant for the current month
                      if (_month == DateFormat('yyyy-MM').format(DateTime.now())) ...[
                        _TodayCard(energy: _todayEnergy),
                        const SizedBox(height: 20),
                      ],

                      // Daily bar chart
                      if (_daily.isEmpty)
                        const _EmptyView()
                      else
                        _DailyChart(daily: _daily, month: _month),
                    ],
                  ),
                ),
    );
  }

  List<String> _buildMonthOptions() {
    final now = DateTime.now();
    return List.generate(6, (i) {
      final m = DateTime(now.year, now.month - i);
      return DateFormat('yyyy-MM').format(m);
    });
  }
}

// ── Month picker ──────────────────────────────────────────────────────────────

class _MonthPicker extends StatelessWidget {
  const _MonthPicker({required this.months, required this.selected, required this.onChanged});
  final List<String> months;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: kBorderColor),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: selected,
          dropdownColor: kCardBg,
          style: const TextStyle(color: kTextBody, fontSize: 14),
          isExpanded: true,
          items: months.map((m) {
            final dt = DateTime.parse('$m-01');
            return DropdownMenuItem(
              value: m,
              child: Text(DateFormat('MMMM yyyy').format(dt)),
            );
          }).toList(),
          onChanged: (v) { if (v != null) onChanged(v); },
        ),
      ),
    );
  }
}

// ── Today energy card ─────────────────────────────────────────────────────────

class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.energy});
  final double energy;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: kCardBg,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: kPrimaryBlue.withOpacity(0.4)),
    ),
    child: Row(
      children: [
        const Icon(Icons.bolt_rounded, color: kPrimaryBlue, size: 28),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Today's Energy", style: TextStyle(color: kTextMuted, fontSize: 12)),
            Text(
              '${energy.toStringAsFixed(3)} kWh',
              style: const TextStyle(color: kTextBody, fontSize: 22, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const Spacer(),
        const _LiveDot(),
      ],
    ),
  );
}

class _LiveDot extends StatelessWidget {
  const _LiveDot();
  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 8, height: 8,
        decoration: BoxDecoration(color: kSuccess, shape: BoxShape.circle),
      ),
      const SizedBox(width: 4),
      const Text('live', style: TextStyle(fontSize: 10, color: kSuccess)),
    ],
  );
}

// ── Daily bar chart ───────────────────────────────────────────────────────────

// mysql2 returns DECIMAL columns as strings; parse both num and String safely.
double _parseKwh(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}

String _dateStr(dynamic v) => v?.toString() ?? '';

class _DailyChart extends StatelessWidget {
  const _DailyChart({required this.daily, required this.month});
  final List<Map<String, dynamic>> daily;
  final String month;

  @override
  Widget build(BuildContext context) {
    final sorted = List<Map<String, dynamic>>.from(daily)
      ..sort((a, b) => _dateStr(a['date']).compareTo(_dateStr(b['date'])));

    final maxY = sorted.fold<double>(0, (m, d) {
      final v = _parseKwh(d['total_energy_kwh']);
      return v > m ? v : m;
    });
    final yMax = maxY == 0 ? 1.0 : (maxY * 1.25);

    final bars = sorted.asMap().entries.map((entry) {
      final i = entry.key;
      final d = entry.value;
      final kwh = _parseKwh(d['total_energy_kwh']);
      final dateStr = d['date'] as String? ?? '';
      final isToday = dateStr.startsWith(DateFormat('yyyy-MM-dd').format(DateTime.now()));
      return BarChartGroupData(
        x: i,
        barRods: [
          BarChartRodData(
            toY: kwh,
            color: isToday ? kPrimaryBlue : kPrimaryBlue.withOpacity(0.55),
            width: 14,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
          ),
        ],
      );
    }).toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: kBorderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Daily Energy — ${DateFormat('MMMM yyyy').format(DateTime.parse('$month-01'))}',
            style: const TextStyle(color: kTextBody, fontWeight: FontWeight.bold, fontSize: 13),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 200,
            child: BarChart(
              BarChartData(
                maxY: yMax,
                barGroups: bars,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(color: kBorderColor, strokeWidth: 0.5),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 40,
                      getTitlesWidget: (v, _) => Text(
                        v.toStringAsFixed(1),
                        style: const TextStyle(fontSize: 9, color: kTextMuted),
                      ),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      interval: 1,
                      getTitlesWidget: (v, _) {
                        final idx = v.toInt();
                        if (idx < 0 || idx >= sorted.length) return const SizedBox.shrink();
                        final raw = _dateStr(sorted[idx]['date']);
                        final day = raw.length >= 10 ? raw.substring(8, 10) : '';
                        return Text(day, style: const TextStyle(fontSize: 9, color: kTextMuted));
                      },
                    ),
                  ),
                  topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipColor: (_) => kNavy700,
                    getTooltipItem: (group, _, rod, __) {
                      final raw = _dateStr(sorted[group.x.toInt()]['date']);
                      final day = raw.length >= 10 ? raw.substring(5, 10) : raw;
                      return BarTooltipItem(
                        '$day\n${rod.toY.toStringAsFixed(3)} kWh',
                        const TextStyle(color: kTextBody, fontSize: 11),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          const Text('kWh per day', style: TextStyle(fontSize: 10, color: kTextMuted)),
        ],
      ),
    );
  }
}

// ── Shared ────────────────────────────────────────────────────────────────────

class _EmptyView extends StatelessWidget {
  const _EmptyView();
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Text('No data for this month', style: TextStyle(color: kTextMuted)),
    ),
  );
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.error_outline, size: 48, color: kDanger),
        const SizedBox(height: 12),
        Text(message, style: const TextStyle(color: kTextMuted), textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    ),
  );
}
