import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// Simple JSON cache backed by SharedPreferences.
/// Stores data with an expiry timestamp so stale entries are ignored.
class AppCache {
  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  /// Returns cached value if present and not older than [maxAgeSeconds].
  /// Returns null if missing or expired.
  static T? get<T>(String key, {int maxAgeSeconds = 60}) {
    final prefs = _prefs;
    if (prefs == null) return null;

    final raw = prefs.getString(key);
    if (raw == null) return null;

    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final storedAt = map['_t'] as int? ?? 0;
      final age = DateTime.now().millisecondsSinceEpoch ~/ 1000 - storedAt;
      if (age > maxAgeSeconds) return null;
      return map['d'] as T?;
    } catch (_) {
      return null;
    }
  }

  /// Stores [value] under [key] with the current timestamp.
  static Future<void> set(String key, dynamic value) async {
    final prefs = _prefs;
    if (prefs == null) return;
    final payload = jsonEncode({
      '_t': DateTime.now().millisecondsSinceEpoch ~/ 1000,
      'd': value,
    });
    await prefs.setString(key, payload);
  }

  /// Returns cached raw map even if expired (for stale-while-revalidate).
  static Map<String, dynamic>? getStale(String key) {
    final prefs = _prefs;
    if (prefs == null) return null;
    final raw = prefs.getString(key);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map['d'] as Map<String, dynamic>?;
    } catch (_) {
      return null;
    }
  }

  static Future<void> remove(String key) async {
    await _prefs?.remove(key);
  }
}
