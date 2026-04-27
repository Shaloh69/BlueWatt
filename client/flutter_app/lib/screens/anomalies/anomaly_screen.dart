import 'dart:async';
import 'package:flutter/material.dart';
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

  void _onSse(SseEvent event) {
    if (event.type == 'anomaly_resolved') {
      final resolvedId = event.data['event_id'] as int?;
      if (resolvedId != null) {
        setState(() {
          _events = _events.map((e) =>
            e.id == resolvedId ? e.copyWithResolved() : e
          ).toList();
        });
      }
      return;
    }
    if (event.type != 'anomaly') return;
    final home = context.read<HomeProvider>();
    final deviceId = event.data['device_id'];
    if (home.pad?.deviceId != null && deviceId == home.pad!.deviceId) {
      // Prepend a lightweight event from the SSE payload
      final newEvent = AnomalyEvent(
        id: event.data['id'] as int? ?? 0,
        deviceId: deviceId as int? ?? 0,
        anomalyType: event.data['anomaly_type'] as String? ?? 'unknown',
        severity: event.data['severity'] as String? ?? 'low',
        relayTripped: event.data['relay_tripped'] == true,
        isResolved: false,
        timestamp: DateTime.now().toIso8601String(),
        currentValue: (event.data['current_value'] as num?)?.toDouble(),
        voltageValue: (event.data['voltage_value'] as num?)?.toDouble(),
        powerValue: (event.data['power_value'] as num?)?.toDouble(),
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
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _load,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorView(message: _error!, onRetry: _load)
              : _events.isEmpty
                  ? const _EmptyView()
                  : RefreshIndicator(
                      onRefresh: _load,
                      color: kPrimaryBlue,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _events.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) => _AnomalyCard(
                          event: _events[i],
                          onResolve: () => _resolve(_events[i]),
                        ),
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
    final ts = DateTime.tryParse(event.timestamp);
    final timeStr = ts != null
        ? '${ts.month}/${ts.day} ${ts.hour.toString().padLeft(2, '0')}:${ts.minute.toString().padLeft(2, '0')}'
        : event.timestamp;

    return Container(
      decoration: BoxDecoration(
        color: kCardBg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: event.isResolved ? kBorderColor : color.withOpacity(0.5)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_severityIcon(event.severity), color: color, size: 18),
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
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: (event.isResolved ? kTextMuted : color).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    event.isResolved ? 'resolved' : event.severity,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: event.isResolved ? kTextMuted : color,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (event.currentValue != null) _Metric('I', '${event.currentValue!.toStringAsFixed(2)} A'),
                if (event.voltageValue != null) _Metric('V', '${event.voltageValue!.toStringAsFixed(1)} V'),
                if (event.powerValue != null)   _Metric('P', '${event.powerValue!.toStringAsFixed(1)} W'),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Text(timeStr, style: const TextStyle(fontSize: 11, color: kTextMuted)),
                if (event.relayTripped) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: kDanger.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('relay tripped', style: TextStyle(fontSize: 10, color: kDanger)),
                  ),
                ],
                const Spacer(),
                if (!event.isResolved)
                  GestureDetector(
                    onTap: onResolve,
                    child: Text(
                      'Mark resolved',
                      style: TextStyle(fontSize: 11, color: kPrimaryBlue, fontWeight: FontWeight.w600),
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

class _Metric extends StatelessWidget {
  const _Metric(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 14),
    child: RichText(
      text: TextSpan(
        children: [
          TextSpan(text: '$label  ', style: const TextStyle(fontSize: 10, color: kTextMuted)),
          TextSpan(text: value, style: const TextStyle(fontSize: 12, color: kTextBody, fontWeight: FontWeight.w600)),
        ],
      ),
    ),
  );
}

class _EmptyView extends StatelessWidget {
  const _EmptyView();
  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.check_circle_outline_rounded, size: 56, color: kSuccess),
        SizedBox(height: 12),
        Text('No anomalies detected', style: TextStyle(color: kTextMuted, fontSize: 15)),
      ],
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
