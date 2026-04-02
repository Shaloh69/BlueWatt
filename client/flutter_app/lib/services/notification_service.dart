import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../config/constants.dart';

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();

  static const _androidDetails = AndroidNotificationDetails(
    kNotifChannelId,
    kNotifChannelName,
    importance: Importance.high,
    priority: Priority.high,
    icon: '@mipmap/ic_launcher',
  );

  static const _iosDetails = DarwinNotificationDetails(
    presentAlert: true,
    presentBadge: true,
    presentSound: true,
  );

  static const _details = NotificationDetails(
    android: _androidDetails,
    iOS: _iosDetails,
  );

  static int _id = 0;

  static Future<void> init() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    const initSettings =
        InitializationSettings(android: androidInit, iOS: iosInit);
    await _plugin.initialize(initSettings);
  }

  static Future<void> requestPermission() async {
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  static Future<void> showAnomalyAlert({
    required String type,
    required String severity,
    bool relayTripped = false,
  }) async {
    final title = relayTripped
        ? '⚡ Power Cut — ${_typeLabel(type)}'
        : '⚠️ Safety Alert — ${_typeLabel(type)}';
    final body = relayTripped
        ? 'Relay tripped due to $severity anomaly. Check your unit.'
        : 'Severity: $severity. Monitor your electrical unit.';
    await _plugin.show(_id++, title, body, _details);
  }

  static Future<void> showPaymentApproved() async {
    await _plugin.show(
      _id++,
      '✓ Payment Approved',
      'Your payment has been verified by the admin.',
      _details,
    );
  }

  static Future<void> showPaymentRejected(String? reason) async {
    await _plugin.show(
      _id++,
      '✗ Payment Rejected',
      reason != null && reason.isNotEmpty
          ? 'Reason: $reason'
          : 'Your payment was rejected. Please resubmit.',
      _details,
    );
  }

  static Future<void> showRelayStateChange(String state) async {
    final label = state == 'on'
        ? 'Power Restored'
        : state == 'tripped'
            ? 'Power Cut (Tripped)'
            : 'Power Turned Off';
    await _plugin.show(
      _id++,
      '🔌 $label',
      'Your unit relay status changed to: $state',
      _details,
    );
  }

  static String _typeLabel(String type) => type
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? '' : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}
