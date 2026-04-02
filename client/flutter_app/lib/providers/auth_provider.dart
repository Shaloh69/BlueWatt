import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';

enum AuthState { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  AuthState _state = AuthState.unknown;
  User? _user;
  String? _token;

  AuthState get state => _state;
  User? get user => _user;
  String? get token => _token;
  bool get isAuthenticated => _state == AuthState.authenticated;

  Future<void> init() async {
    final token = await StorageService.getToken();
    final userJson = await StorageService.getUser();
    if (token != null && userJson != null) {
      _token = token;
      _user = User.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      _state = AuthState.authenticated;
    } else {
      _state = AuthState.unauthenticated;
    }
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final body = await ApiService.login(email, password);
    final data = body['data'] as Map<String, dynamic>? ?? body;
    final token = data['token'] as String? ??
        body['token'] as String? ??
        '';
    final userMap = data['user'] as Map<String, dynamic>? ??
        body['user'] as Map<String, dynamic>? ??
        {};
    _token = token;
    _user = User.fromJson(userMap);
    await StorageService.saveToken(token);
    await StorageService.saveUser(jsonEncode(userMap));
    _state = AuthState.authenticated;
    notifyListeners();
  }

  Future<void> logout() async {
    await StorageService.clear();
    _token = null;
    _user = null;
    _state = AuthState.unauthenticated;
    notifyListeners();
  }
}
