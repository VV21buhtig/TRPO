import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../models/menu_item.dart';
import '../models/order.dart';
import '../models/user.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class AuthResult {
  const AuthResult({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final User user;
}

class PaymentResult {
  const PaymentResult({required this.bonusAccrued, required this.order});

  final int bonusAccrued;
  final Order order;
}

class ApiClient {
  ApiClient({String? baseUrl})
      : baseUrl = baseUrl ??
            const String.fromEnvironment(
              'API_BASE',
              defaultValue: 'http://10.0.2.2:5080/api/v1',
            );

  final String baseUrl;
  String? token;
  String? refreshToken;
  Future<void> Function(String access, String refresh)? onTokensRefreshed;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    bool auth = true,
  }) async {
    var response = await _perform(method, path, body: body, auth: auth);

    // Access-токен живёт 15 минут: при 401 пробуем обновить сессию.
    if (response.statusCode == 401 && auth && await _refresh()) {
      response = await _perform(method, path, body: body, auth: auth);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      var message = 'Ошибка ${response.statusCode}';
      try {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic>) {
          message = (decoded['error'] ?? decoded['title'] ?? message).toString();
        }
      } catch (_) {
        /* тело не JSON */
      }
      throw ApiException(message, statusCode: response.statusCode);
    }

    if (response.bodyBytes.isEmpty) return null;
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<http.Response> _perform(
    String method,
    String path, {
    Object? body,
    bool auth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = Map<String, String>.from(_headers);
    if (!auth) {
      headers.remove('Authorization');
    }

    try {
      switch (method) {
        case 'POST':
          return await http
              .post(
                uri,
                headers: headers,
                body: body == null ? null : jsonEncode(body),
              )
              .timeout(const Duration(seconds: 15));
        case 'PATCH':
          return await http
              .patch(uri, headers: headers, body: jsonEncode(body))
              .timeout(const Duration(seconds: 15));
        default:
          return await http
              .get(uri, headers: headers)
              .timeout(const Duration(seconds: 15));
      }
    } on SocketException {
      throw ApiException('Нет соединения с сервером. Проверьте адрес API.');
    } on TimeoutException {
      throw ApiException('Сервер не отвечает. Попробуйте ещё раз.');
    } on http.ClientException catch (error) {
      throw ApiException('Ошибка сети: ${error.message}');
    }
  }

  Future<bool> _refresh() async {
    final current = refreshToken;
    if (current == null || current.isEmpty) return false;

    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refreshToken': current}),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) return false;

      final data =
          jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final access = data['accessToken'] as String?;
      final refresh = data['refreshToken'] as String?;
      if (access == null || refresh == null) return false;

      token = access;
      refreshToken = refresh;
      await onTokensRefreshed?.call(access, refresh);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<AuthResult> login(String phone, String password) async {
    final data = await _send(
      'POST',
      '/auth/login',
      body: {'phone': phone, 'password': password},
      auth: false,
    ) as Map<String, dynamic>;

    return AuthResult(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<String> requestSmsCode(String phone) async {
    final data = await _send(
      'POST',
      '/auth/sms-code',
      body: {'phone': phone},
      auth: false,
    ) as Map<String, dynamic>;
    return data['code'] as String? ?? '0000';
  }

  Future<AuthResult> loginSms(String phone, String code) async {
    final data = await _send(
      'POST',
      '/auth/login-sms',
      body: {'phone': phone, 'code': code},
      auth: false,
    ) as Map<String, dynamic>;

    return AuthResult(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
      user: User.fromJson(data['user'] as Map<String, dynamic>),
    );
  }

  Future<User> me() async {
    final data = await _send('GET', '/users/me') as Map<String, dynamic>;
    return User.fromJson(data);
  }

  Future<User> updateProfile(String name) async {
    final data = await _send(
      'PATCH',
      '/users/me',
      body: {'name': name},
    ) as Map<String, dynamic>;
    return User.fromJson(data);
  }

  Future<List<MenuItem>> menuItems() async {
    final data = await _send('GET', '/menu-items') as List<dynamic>;
    return data
        .map((item) => MenuItem.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<Order>> orders() async {
    final data = await _send('GET', '/orders') as List<dynamic>;
    return data
        .map((item) => Order.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Order> order(int id) async {
    final data = await _send('GET', '/orders/$id') as Map<String, dynamic>;
    return Order.fromJson(data);
  }

  Future<Order> createOrder(
    List<Map<String, int>> items,
    String? comment,
  ) async {
    final data = await _send(
      'POST',
      '/orders',
      body: {'items': items, 'comment': comment},
    ) as Map<String, dynamic>;
    return Order.fromJson(data);
  }

  Future<PaymentResult> pay(int orderId, String method) async {
    final data = await _send(
      'POST',
      '/payments',
      body: {'orderId': orderId, 'method': method},
    ) as Map<String, dynamic>;

    return PaymentResult(
      bonusAccrued: (data['bonusAccrued'] as num?)?.toInt() ?? 0,
      order: Order.fromJson(data['order'] as Map<String, dynamic>),
    );
  }

  Future<int> bonusBalance() async {
    final data = await _send('GET', '/loyalty/balance') as Map<String, dynamic>;
    return (data['balance'] as num?)?.toInt() ?? 0;
  }
}
