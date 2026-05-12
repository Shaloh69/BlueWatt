import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/constants.dart';
import '../../models/anomaly_event.dart';
import '../../providers/home_provider.dart';
import '../../services/api_service.dart';
import '../../services/sse_service.dart';

class AnomalyScreen extends StatefulWidget {
  const AnomalyScreen({super.key});

  @override
  State<AnomalyScreen> createState() => _AnomalyScreenState();
}

class _AnomalyScreenState extends State<AnomalyScreen> {
  List<AnomalyEvent> _events = [];
  bool _loading = true;
  String? _error;
  int _newCount = 0;
  int? _loadedForDeviceId;
  StreamSubscription<SseEvent>? _sseSub;

  // 'all' | 'unresolved' | 'resolved'
  String _filter = 'all';

  List<AnomalyEvent> get _filtered {
    switch (_filter) {
      case 'unresolved': return _events.where((e) => !e.isResolved).toList();
      case 'resolved':   return _events.where((e) => e.isResolved).toList();
      default:           return _events;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

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

  static int _si(dynamic v) =>
      v == null ? 0 : (v is int ? v : int.tryParse(v.toString()) ?? 0);
  static double? _sdNull(dynamic v) =>
      v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));

  void _onSse(SseEvent event) {
    if (event.type == 'anomaly_resolved') {
      final resolvedId = _si(event.data['event_id']);
      if (resolvedId != 0) {
        setState(() {
          _events = _events
              .map((e) => e.id == resolvedId ? e.copyWithResolved() : e)
              .toList();
        });
      }
      return;
    }
    if (event.type != 'anomaly') return;
    final home = context.read<HomeProvider>();
    final deviceId = _si(event.data['device_id']);
    if (home.pad?.deviceId != null && deviceId == home.pad!.deviceId) {
      final newEvent = AnomalyEvent(
        id: _si(event.data['id']),
        deviceId: deviceId,
        anomalyType: event.data['anomaly_type'] as String? ?? 'unknown',
        severity: event.data['severity'] as String? ?? 'low',
        relayTripped: event.data['relay_tripped'] == true,
        isResolved: false,
        timestamp: DateTime.now().toIso8601String(),
        currentValue: _sdNull(event.data['current_value']),
        voltageValue: _sdNull(event.data['voltage_value']),
        powerValue: _sdNull(event.data['power_value']),
      );
      setState(() {
        _events = [newEvent, ..._events];
        _newCount++;
      });
    }
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final home = context.read<HomeProvider>();
      final deviceId = home.pad?.deviceId;
      if (deviceId == null) {
        setState(() { _loading = false; _events = []; });
        return;
      }
      _loadedForDeviceId = deviceId;
      final events = await ApiService.getMyAnomalies(deviceId);
      // newest first
      events.sort((a, b) => b.timestamp.compareTo(a.timestamp));
      setState(() { _events = events; _newCount = 0; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  Future<void> _resolve(AnomalyEvent event) async {
    try {
      await ApiService.resolveAnomaly(event.id);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: kDanger),
        );
      }
    }
  }

  @override
  void dispose() {
    _sseSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    final unresolvedCount = _events.where((e) => !e.isResolved).length;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Anomalies'),
            if (_newCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: kDanger,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '+$_newCount new',
                  style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : Column(
                  children: [
                    // ── Filter chips ─────────────────────────────────────
                    Container(
                      color: kNavy800,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      child: Row(
                        children: [
                          _FilterChip(
                            label: 'All',
                            count: _events.length,
                            active: _filter == 'all',
                            onTap: () => setState(() => _filter = 'all'),
                          ),
                          const SizedBox(width: 8),
                          _FilterChip(
                            label: 'Unresolved',
                            count: unresolvedCount,
                            active: _filter == 'unresolved',
                            activeColor: kDanger,
                            onTap: () => setState(() => _filter = 'unresolved'),
                          ),
                          const SizedBox(width: 8),
                          _FilterChip(
                            label: 'Resolved',
                            count: _events.length - unresolvedCount,
                            active: _filter == 'resolved',
                            activeColor: kSuccess,
                            onTap: () => setState(() => _filter = 'resolved'),
                          ),
                        ],
                      ),
                    ),
                    // ── List ─────────────────────────────────────────────
                    Expanded(
                      child: filtered.isEmpty
                          ? _EmptyView(filter: _filter)
                          : RefreshIndicator(
                              onRefresh: _load,
                              color: kPrimaryBlue,
                              child: ListView.separated(
                                padding: const EdgeInsets.all(16),
                                itemCount: filtered.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 10),
                                itemBuilder: (_, i) => _AnomalyCard(
                                  event: filtered[i],
                                  onResolve: () => _resolve(filtered[i]),
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
    );
  }
}

// ── Filter chip ───────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.active,
    required this.onTap,
    this.activeColor,
  });
  final String label;
  final int count;
  final bool active;
  final Color? activeColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = activeColor ?? kPrimaryBlue;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: active ? color.withOpacity(0.15) : kCardBg,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: active ? color : kBorderColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                color: active ? color : kTextMuted,
              ),
            ),
            const SizedBox(width: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: active ? color.withOpacity(0.2) : kBorderColor.withOpacity(0.4),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: active ? color : kTextMuted,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Severity helpers ──────────────────────────────────────────────────────────

Color _severityColor(String severity) {
  switch (severity) {
    case 'critical': return kDanger;
    case 'high':     return kWarning;
    case 'medium':   return const Color(0xFFF5A524);
    default:         return kTextMuted;
  }
}

IconData _severityIcon(String severity) {
  switch (severity) {
    case 'critical':
    case 'high': return Icons.warning_amber_rounded;
    default:     return Icons.info_outline_rounded;
  }
}

// ── Anomaly card ──────────────────────────────────────────────────────────────

class _AnomalyCard extends StatelessWidget {
  const _AnomalyCard({required this.event, required this.onResolve});
  final AnomalyEvent event;
  final VoidCallback onResolve;

  @override
  Widget build(BuildContext context) {
    final color = _severityColor(event.severity);
    final ts = DateTime.tryParse(event.timestamp)?.toLocal();
    final dateStr = ts != null
        ? DateFormat('MMM d, yyyy').format(ts)
        : '—';
    final timeStr = ts != null
        ? DateFormat('hh:mm a').format(ts)
        : '';

    return Container(
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: event.isResolved ? kBorderColor : color.withOpacity(0.5),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row ────────────────────────────────────────────
            Row(
              children: [
                Icon(
                  event.isResolved
                      ? Icons.check_circle_rounded
                      : _severityIcon(event.severity),
                  color: event.isResolved ? kSuccess : color,
                  size: 18,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    event.typeLabel,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: event.isResolved ? kTextMuted : kTextBody,
                      fontSize: 14,
                    ),
                  ),
                ),
                // Severity / status badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: (event.isResolved ? kSuccess : color).withOpacity(0.13),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    event.isResolved ? 'Resolved' : event.severity.toUpperCase(),
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: event.isResolved ? kSuccess : color,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // ── Metrics row ───────────────────────────────────────────
            if (event.currentValue != null ||
                event.voltageValue != null ||
                event.powerValue != null) ...[
              Row(
                children: [
                  if (event.currentValue != null)
                    _Metric('Current', '${event.currentValue!.toStringAsFixed(2)} A', color),
                  if (event.voltageValue != null)
                    _Metric('Voltage', '${event.voltageValue!.toStringAsFixed(1)} V', color),
                  if (event.powerValue != null)
                    _Metric('Power', '${event.powerValue!.toStringAsFixed(1)} W', color),
                ],
              ),
              const SizedBox(height: 10),
            ],

            // ── Date / time + tags row ────────────────────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Icon(Icons.calendar_today_outlined, size: 12, color: kTextMuted),
                const SizedBox(width: 4),
                Text(dateStr, style: const TextStyle(fontSize: 11, color: kTextMuted)),
                const SizedBox(width: 8),
                const Icon(Icons.access_time_rounded, size: 12, color: kTextMuted),
                const SizedBox(width: 4),
                Text(timeStr, style: const TextStyle(fontSize: 11, color: kTextMuted)),
                if (event.relayTripped) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: kDanger.withOpacity(0.13),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Relay tripped',
                      style: TextStyle(fontSize: 10, color: kDanger, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ],
            ),

            // ── Resolve button ────────────────────────────────────────
            if (!event.isResolved) ...[
              const SizedBox(height: 10),
              const Divider(height: 1, color: kBorderColor),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: onResolve,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    const Icon(Icons.check_circle_outline_rounded, size: 14, color: kPrimaryBlue),
                    const SizedBox(width: 5),
                    Text(
                      'Mark as Resolved',
                      style: TextStyle(
                        fontSize: 12,
                        color: kPrimaryBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value, this.color);
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 9, color: kTextMuted)),
        Text(
          value,
          style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.filter});
  final String filter;

  @override
  Widget build(BuildContext context) {
    final msg = filter == 'resolved'
        ? 'No resolved anomalies'
        : filter == 'unresolved'
            ? 'No unresolved anomalies'
            : 'No anomalies recorded yet';
    final icon = filter == 'unresolved'
        ? Icons.check_circle_outline_rounded
        : Icons.history_rounded;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 56, color: kSuccess),
          const SizedBox(height: 12),
          Text(msg, style: const TextStyle(color: kTextMuted, fontSize: 15)),
        ],
      ),
    );
  }
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
