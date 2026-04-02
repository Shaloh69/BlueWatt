import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import '../config/constants.dart';
import '../models/pad.dart';
import '../models/power_reading.dart';
import '../models/billing_period.dart';
import '../models/payment.dart';
import 'storage_service.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  ApiException(this.message, [this.statusCode]);
  @override
  String toString() => message;
}

class ApiService {
  // ── Internals ──────────────────────────────────────────────────────────────

  static Future<Map<String, String>> _headers() async {
    final token = await StorageService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Map<String, dynamic> _body(http.Response res) {
    final decoded = jsonDecode(res.body) as Map<String, dynamic>;
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
    );
    return _body(res);
  }

  // ── Pad ────────────────────────────────────────────────────────────────────

  static Future<Pad> getMyPad() async {
    final res = await http.get(_uri('/pads/my'), headers: await _headers());
    final body = _body(res);
    return Pad.fromJson(body['data']['pad'] as Map<String, dynamic>);
  }

  // ── Power Data ─────────────────────────────────────────────────────────────

  static Future<PowerReading?> getLatestReading(int deviceId) async {
    final res = await http.get(
      _uri('/power-data/devices/$deviceId/power-data/latest'),
      headers: await _headers(),
    );
    if (res.statusCode == 404) return null;
    final body = _body(res);
    final reading = body['data']['reading'];
    if (reading == null) return null;
    return PowerReading.fromJson(reading as Map<String, dynamic>);
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  static Future<List<BillingPeriod>> getMyBills() async {
    final res =
        await http.get(_uri('/billing/my'), headers: await _headers());
    final body = _body(res);
    final list = body['data']['bills'] as List<dynamic>? ?? [];
    return list
        .map((e) => BillingPeriod.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<BillingPeriod> getBill(int id) async {
    final res =
        await http.get(_uri('/billing/$id'), headers: await _headers());
    final body = _body(res);
    return BillingPeriod.fromJson(
        body['data']['bill'] as Map<String, dynamic>);
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  static Future<List<PaymentQrCode>> getQrCodes() async {
    final res =
        await http.get(_uri('/payments/qr-codes'), headers: await _headers());
    final body = _body(res);
    final list = body['data'] as List<dynamic>? ?? [];
    return list
        .map((e) => PaymentQrCode.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<void> submitPayment({
    required int billingPeriodId,
    required String paymentMethod,
    required String referenceNumber,
    required File receiptImage,
  }) async {
    final token = await StorageService.getToken();
    final request = http.MultipartRequest(
      'POST',
      _uri('/payments/submit'),
    );
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    request.fields['billing_period_id'] = billingPeriodId.toString();
    request.fields['payment_method'] = paymentMethod;
    request.fields['reference_number'] = referenceNumber;
    request.files.add(
      await http.MultipartFile.fromPath('receipt_image', receiptImage.path),
    );
    final streamed = await request.send();
    final res = await http.Response.fromStream(streamed);
    if (res.statusCode >= 400) {
      final decoded = jsonDecode(res.body) as Map<String, dynamic>;
      throw ApiException(
        decoded['message'] as String? ?? 'Payment submission failed',
        res.statusCode,
      );
    }
  }
}
