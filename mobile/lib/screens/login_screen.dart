import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/theme.dart';
import '../state/auth_state.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController(text: '+79991234567');
  final _password = TextEditingController(text: '12345');
  final _code = TextEditingController(text: '0000');

  bool _smsMode = false;
  bool _codeSent = false;
  String? _localError;

  @override
  void dispose() {
    _phone.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final auth = context.read<AuthState>();
    setState(() => _localError = null);

    final success = _smsMode
        ? await auth.loginSms(_phone.text.trim(), _code.text.trim())
        : await auth.login(_phone.text.trim(), _password.text);

    if (!success && mounted) {
      setState(() => _localError = auth.error);
    }
  }

  Future<void> _requestCode() async {
    final api = context.read<ApiClient>();
    setState(() => _localError = null);

    try {
      final code = await api.requestSmsCode(_phone.text.trim());
      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _code.text = code;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Демо-код подтверждения: $code')),
      );
    } on ApiException catch (error) {
      setState(() => _localError = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final error = _localError ?? auth.error;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: brandOrange,
                          borderRadius: BorderRadius.circular(13),
                          boxShadow: [
                            BoxShadow(
                              color: brandOrange.withValues(alpha: 0.35),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'О',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'Онлайн-заказ',
                        style: TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                  const Text(
                    'Вход в личный кабинет',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w700,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Заказывайте без очереди, копите бонусы '
                    'и следите за статусом заказа.',
                    style: TextStyle(
                      color: mutedInk,
                      fontSize: 14,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 24),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('По паролю')),
                      ButtonSegment(value: true, label: Text('По SMS-коду')),
                    ],
                    selected: {_smsMode},
                    onSelectionChanged: (selection) {
                      setState(() {
                        _smsMode = selection.first;
                        _localError = null;
                      });
                    },
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Телефон',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF4B5563),
                    ),
                  ),
                  const SizedBox(height: 7),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(hintText: '+7 999 123-45-67'),
                    validator: (value) {
                      final phone =
                          (value ?? '').replaceAll(RegExp(r'[\s()\-]'), '');
                      if (!RegExp(r'^\+7\d{10}$').hasMatch(phone)) {
                        return 'Введите телефон в формате +7XXXXXXXXXX';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 14),
                  if (_smsMode) ...[
                    const Text(
                      'Код подтверждения',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF4B5563),
                      ),
                    ),
                    const SizedBox(height: 7),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _code,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(hintText: '0000'),
                            validator: (value) => (value ?? '').trim().isEmpty
                                ? 'Введите код'
                                : null,
                          ),
                        ),
                        const SizedBox(width: 10),
                        OutlinedButton(
                          onPressed: _requestCode,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 50),
                          ),
                          child: Text(_codeSent ? 'Ещё раз' : 'Получить код'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Демо-режим: код 0000',
                      style: TextStyle(fontSize: 12, color: mutedInk),
                    ),
                  ] else ...[
                    const Text(
                      'Пароль',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF4B5563),
                      ),
                    ),
                    const SizedBox(height: 7),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(hintText: '•••••'),
                      validator: (value) =>
                          (value ?? '').isEmpty ? 'Введите пароль' : null,
                    ),
                  ],
                  const SizedBox(height: 20),
                  if (error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3F2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFFECDCA)),
                      ),
                      child: Text(
                        error,
                        style: const TextStyle(
                          color: Color(0xFFB42318),
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                  ],
                  FilledButton(
                    onPressed: auth.busy ? null : _submit,
                    child: auth.busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Войти'),
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: lineColor),
                    ),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Демо-доступ',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Клиент: +79991234567 / 12345\n'
                          'Оператор: +79990000001 / 12345',
                          style: TextStyle(
                            fontSize: 12.5,
                            color: mutedInk,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
