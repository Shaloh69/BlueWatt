import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config/constants.dart';

class StorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static Future<void> saveToken(String token) =>
      _storage.write(key: kTokenKey, value: token);

  static Future<String?> getToken() => _storage.read(key: kTokenKey);

  static Future<void> saveUser(String userJson) =>
      _storage.write(key: kUserKey, value: userJson);

  static Future<String?> getUser() => _storage.read(key: kUserKey);

  static Future<void> clear() => _storage.deleteAll();
}
