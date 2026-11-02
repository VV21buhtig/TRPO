import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../state/auth_state.dart';
import '../state/cart_state.dart';
import 'order_status_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  final TextEditingController _address = TextEditingController();
  final TextEditingController _comment = TextEditingController();

  String _method = 'Card';
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthState>().user;
    _name = TextEditingController(text: user?.name ?? '');
    _phone = TextEditingController(text: user?.phone ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final cart = context.read<CartState>();
    final api = context.read<ApiClient>();
    if (cart.isEmpty) return;

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final order = await api.createOrder(
        cart.lines
            .map((line) => {
                  'menuItemId': line.item.id,
                  'quantity': line.quantity,
                })
            .toList(),
        _comment.text.trim().isEmpty ? null : _comment.text.trim(),
      );

      await api.pay(order.id, _method);
      cart.clear();

      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => OrderStatusScreen(orderId: order.id, justPaid: true),
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();

    return Scaffold(
      appBar: AppBar(title: const Text('Оформление заказа')),
      body: cart.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text(
                  'Корзина пуста',
                  style: TextStyle(fontSize: 17, color: mutedInk),
                ),
              ),
            )
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  const Text(
                    'Получатель',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: lineColor),
                    ),
                    child: Column(
                      children: [
                        TextFormField(
                          controller: _name,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(labelText: 'Имя'),
                          validator: (value) =>
                              (value ?? '').trim().isEmpty ? 'Укажите имя' : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _phone,
                          keyboardType: TextInputType.phone,
                          textInputAction: TextInputAction.next,
                          decoration:
                              const InputDecoration(labelText: 'Телефон'),
                          validator: (value) {
                            final phone = (value ?? '')
                                .replaceAll(RegExp(r'[\s()\-]'), '');
                            if (!RegExp(r'^\+7\d{10}$').hasMatch(phone)) {
                              return 'Формат: +7XXXXXXXXXX';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _address,
                          textInputAction: TextInputAction.next,
                          decoration: const InputDecoration(
                            labelText: 'Адрес доставки',
                            hintText: 'ул. Ленина, 10, кв. 5',
                          ),
                          validator: (value) => (value ?? '').trim().length < 5
                              ? 'Укажите адрес доставки'
                              : null,
                        ),
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _comment,
                          maxLines: 3,
                          decoration: const InputDecoration(
                            labelText: 'Комментарий',
                            hintText: 'Домофон, пожелания по составу…',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'Оплата',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: _payOption(
                          selected: _method == 'Card',
                          icon: Icons.credit_card,
                          title: 'Карта',
                          subtitle: 'Visa, МИР',
                          onTap: () => setState(() => _method = 'Card'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _payOption(
                          selected: _method == 'SBP',
                          icon: Icons.qr_code_2,
                          title: 'СБП',
                          subtitle: 'По QR-коду',
                          onTap: () => setState(() => _method = 'SBP'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'После оплаты начислим 5% бонусами на счёт.',
                    style: TextStyle(fontSize: 12.5, color: mutedInk),
                  ),
                  const SizedBox(height: 22),
                  const Text(
                    'Ваш заказ',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: lineColor),
                    ),
                    child: Column(
                      children: [
                        for (final line in cart.lines)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${line.item.name}  × ${line.quantity}',
                                    style: const TextStyle(fontSize: 13.5),
                                  ),
                                ),
                                Text(
                                  money(line.total),
                                  style: const TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const Divider(),
                        Row(
                          children: [
                            const Text(
                              'Итого',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const Spacer(),
                            Text(
                              money(cart.total),
                              style: const TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF3F2),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFFECDCA)),
                      ),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          color: Color(0xFFB42318),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    child: _busy
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : Text('Оплатить ${money(cart.total)}'),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _payOption({
    required bool selected,
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFFFF9F5) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? brandOrange : lineColor,
            width: selected ? 1.4 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 22, color: selected ? brandOrange : mutedInk),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: const TextStyle(fontSize: 11, color: mutedInk),
                  ),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              size: 18,
              color: selected ? brandOrange : lineColor,
            ),
          ],
        ),
      ),
    );
  }
}
