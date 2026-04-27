import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/pad.dart';
import '../models/power_reading.dart';
import '../models/billing_period.dart';
import '../models/payment.dart';
import '../models/user.dart';
import '../models/anomaly_event.dart';
import 'storage_service.dart';
import 'app_cache.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, [this.statusCode]);
  @override
  String toString() => message;
}

class ApiService {
  static const _timeout = Duration(seconds: 60); // Render free tier cold-start can take 30-50 s

  // ── Internals ──────────────────────────────────────────────────────────────

  static Future<Map<String, String>> _headers() async {
    final token = await StorageService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Map<String, dynamic> _body(http.Response res) {
    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException(
        res.statusCode == 429
            ? 'Too many attempts — please wait a moment and try again'
            : res.statusCode >= 500
                ? 'Server error (${res.statusCode}) — please try again'
                : 'Unexpected response from server',
        res.statusCode,
      );
    }
    if (res.statusCode >= 400) {
      throw ApiException(
        decoded['message'] as String? ?? 'Request failed',
        res.statusCode,
      );
    }
    return decoded;
  }

  static Uri _uri(String path, [Map<String, String>? params]) {
    final uri = Uri.parse('$kApiBase$path');
    return params != null ? uri.replace(queryParameters: params) : uri;
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> login(
      String email, String password) async {
    final res = await http.post(
      _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out. Is the server reachable?'));
    return _body(res);
  }

  static Future<User> getMe() async {
    final res = await http.get(_uri('/auth/me'), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    return User.fromJson(body['data'] as Map<String, dynamic>);
  }

  static Future<User> updateProfile({String? fullName, String? email}) async {
    final res = await http.put(
      _uri('/auth/profile'),
      headers: await _headers(),
      body: jsonEncode({
        if (fullName != null) 'full_name': fullName,
        if (email != null) 'email': email,
      }),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    return User.fromJson(body['data'] as Map<String, dynamic>);
  }

  static Future<void> changePassword(
      String currentPassword, String newPassword) async {
    final res = await http.put(
      _uri('/auth/password'),
      headers: await _headers(),
      body: jsonEncode({
        'current_password': currentPassword,
        'new_password': newPassword,
      }),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    _body(res);
  }

  static Future<void> forgotPassword(String email) async {
    final res = await http.post(
      _uri('/auth/forgot-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email}),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    _body(res);
  }

  static Future<void> resetPassword({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    final res = await http.post(
      _uri('/auth/reset-password'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'otp': otp,
        'new_password': newPassword,
      }),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    _body(res);
  }

  static Future<User> uploadProfileImage(File imageFile) async {
    final token = await StorageService.getToken();
    final request = http.MultipartRequest('POST', _uri('/upload/profile-image'));
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.files.add(
      await http.MultipartFile.fromPath('image', imageFile.path),
    );
    final streamed = await request.send()
        .timeout(_timeout, onTimeout: () => throw ApiException('Upload timed out'));
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode >= 400) {
      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      throw ApiException(
        decoded['message'] as String? ?? 'Upload failed',
        res.statusCode,
      );
    }
    // Re-fetch user so profile_image_url is current
    return getMe();
  }

  // ── Pad ────────────────────────────────────────────────────────────────────

  static Future<Pad> getMyPad() async {
    final res = await http.get(_uri('/pads/my'), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    return Pad.fromJson(body['data']['pad'] as Map<String, dynamic>);
  }

  // ── Power Data ─────────────────────────────────────────────────────────────

  static Future<PowerReading?> getLatestReading(int deviceId) async {
    final res = await http.get(
      _uri('/power-data/devices/$deviceId/latest'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    if (res.statusCode == 404) return null;
    final body = _body(res);
    final reading = body['data']['reading'];
    if (reading == null) return null;
    return PowerReading.fromJson(reading as Map<String, dynamic>);
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  static Future<List<BillingPeriod>> getMyBills() async {
    final res = await http.get(_uri('/billing/my'), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    final list = body['data']['bills'] as List<dynamic>? ?? [];
    return list
        .map((e) => BillingPeriod.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<BillingPeriod> getBill(int id) async {
    final res = await http.get(_uri('/billing/$id'), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    return BillingPeriod.fromJson(
        body['data']['bill'] as Map<String, dynamic>);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  static Future<List<PaymentQrCode>> getQrCodes() async {
    final res = await http.get(_uri('/payments/qr-codes'), headers: await _headers())
        .timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    final body = _body(res);
    // Server returns { data: { qr_codes: [...] } }
    final list = body['data']['qr_codes'] as List<dynamic>? ?? [];
    final codes = list
        .map((e) => PaymentQrCode.fromJson(e as Map<String, dynamic>))
        .toList();
    // Cache for offline use
    await AppCache.set('payment:qr_codes', {
      'list': list,
    });
    return codes;
  }

  static List<PaymentQrCode> getQrCodesFromCache() {
    final cached = AppCache.getStale('payment:qr_codes');
    if (cached == null) return [];
    final list = cached['list'] as List<dynamic>? ?? [];
    try {
      return list
          .map((e) => PaymentQrCode.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  // ── Relay ──────────────────────────────────────────────────────────────────

  static Future<void> sendRelayOff() async {
    final res = await http.post(
      _uri('/pads/my/relay-command'),
      headers: await _headers(),
      body: jsonEncode({'command': 'off'}),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    _body(res);
  }

  // ── Anomalies ──────────────────────────────────────────────────────────────

  static Future<List<AnomalyEvent>> getMyAnomalies(int deviceId) async {
    final res = await http.get(
      _uri('/anomaly-events/devices/$deviceId/anomaly-events'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    if (res.statusCode == 404) return [];
    final body = _body(res);
    final list = body['data']['events'] as List<dynamic>? ?? [];
    return list.map((e) => AnomalyEvent.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> resolveAnomaly(int id) async {
    final res = await http.put(
      _uri('/anomaly-events/$id/resolve'),
      headers: await _headers(),
      body: '{}',
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    _body(res);
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  static Future<List<Map<String, dynamic>>> getAllDailyReport(int deviceId) async {
    final res = await http.get(
      _uri('/reports/daily/$deviceId/all'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    if (res.statusCode == 404) return [];
    final body = _body(res);
    final list = body['data']['days'] as List<dynamic>? ?? [];
    return list.map((e) => e as Map<String, dynamic>).toList();
  }

  static Future<List<Map<String, dynamic>>> getDailyReport(int deviceId, {String? month}) async {
    final params = <String, String>{};
    if (month != null) params['month'] = month;
    final res = await http.get(
      _uri('/reports/daily/$deviceId', params.isNotEmpty ? params : null),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    if (res.statusCode == 404) return [];
    final body = _body(res);
    final list = body['data']['daily'] as List<dynamic>? ?? [];
    return list.map((e) => e as Map<String, dynamic>).toList();
  }

  static Future<double> getTodayEnergy(int deviceId) async {
    final res = await http.get(
      _uri('/power-data/devices/$deviceId/today-energy'),
      headers: await _headers(),
    ).timeout(_timeout, onTimeout: () => throw ApiException('Connection timed out'));
    if (res.statusCode == 404) return 0;
    final body = _body(res);
    return (body['data']['today_energy_kwh'] as num?)?.toDouble() ?? 0;
  }

  static Future<void> submitPayment({
    required int billingPeriodId,
    required String paymentMethod,
    required String referenceNumber,
    required List<File> receiptImages,
  }) async {
    assert(receiptImages.isNotEmpty && receiptImages.length <= 3);
    final token = await StorageService.getToken();
    final request = http.MultipartRequest('POST', _uri('/payments/submit'));
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.fields['billing_period_id'] = billingPeriodId.toString();
    request.fields['payment_method'] = paymentMethod;
    request.fields['reference_number'] = referenceNumber;
    for (final image in receiptImages) {
      request.files.add(await http.MultipartFile.fromPath('receipts', image.path));
    }
    final streamed = await request.send().timeout(
      _timeout,
      onTimeout: () => throw ApiException('Upload timed out. Please try again.'),
    );
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode >= 400) _body(res);
  }
}
