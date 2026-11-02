import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../models/user.dart';

class AuthState extends ChangeNotifier {
  AuthState(this._api) {
    _api.onTokensRefreshed = _persistTokens;
  }

  final ApiClient _api;

  User? _user;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  User? get user => _user;
  bool get loading => _loading;
  bool get busy => _busy;
  String? get error => _error;
  bool get isAuthenticated => _api.token != null && _user != null;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('ff_token');
    final refresh = prefs.getString('ff_refresh');

    if (token == null || token.isEmpty) {
      _loading = false;
      notifyListeners();
      return;
    }

    _api.token = token;
    _api.refreshToken = refresh;
    try {
      _user = await _api.me();
    } catch (_) {
      _api.token = null;
      _api.refreshToken = null;
      await prefs.remove('ff_token');
      await prefs.remove('ff_refresh');
    }
    _loading = false;
    notifyListeners();
  }

  Future<bool> login(String phone, String password) {
    return _run(() => _api.login(phone, password));
  }

  Future<bool> loginSms(String phone, String code) {
    return _run(() => _api.loginSms(phone, code));
  }

  Future<bool> _run(Future<AuthResult> Function() action) async {
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      final result = await action();
      _api.token = result.accessToken;
      _api.refreshToken = result.refreshToken;
      _user = result.user;

      await _persistTokens(result.accessToken, result.refreshToken);
      return true;
    } on ApiException catch (error) {
      _error = error.message;
      return false;
    } catch (_) {
      _error = 'Не удалось выполнить вход. Попробуйте ещё раз.';
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> _persistTokens(String access, String refresh) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ff_token', access);
    await prefs.setString('ff_refresh', refresh);
  }

  void updateUser(User user) {
    _user = user;
    notifyListeners();
  }

  Future<void> logout() async {
    _api.token = null;
    _api.refreshToken = null;
    _user = null;
    _error = null;

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ff_token');
    await prefs.remove('ff_refresh');
    notifyListeners();
  }
}
