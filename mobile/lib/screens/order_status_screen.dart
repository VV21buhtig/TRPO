import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/order_status.dart';
import '../core/theme.dart';
import '../models/order.dart';

class OrderStatusScreen extends StatefulWidget {
  const OrderStatusScreen({
    super.key,
    required this.orderId,
    this.justPaid = false,
  });

  final int orderId;
  final bool justPaid;

  @override
  State<OrderStatusScreen> createState() => _OrderStatusScreenState();
}

class _OrderStatusScreenState extends State<OrderStatusScreen> {
  static const List<String> _steps = [
    'Accepted',
    'Cooking',
    'Ready',
    'Completed',
  ];

  Order? _order;
  String? _error;
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    try {
      final order = await context.read<ApiClient>().order(widget.orderId);
      if (!mounted) return;
      setState(() {
        _order = order;
        _error = null;
        _loading = false;
      });
      if (order.status == 'Completed' || order.status == 'Cancelled') {
        _timer?.cancel();
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      if (!silent || _order == null) {
        setState(() {
          _error = error.message;
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_order?.number ?? 'Заказ')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _order == null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () => _load(),
                          child: const Text('Повторить'),
                        ),
                      ],
                    ),
                  ),
                )
              : _content(_order!),
    );
  }

  Widget _content(Order order) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        Center(
          child: Column(
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: widget.justPaid
                      ? const Color(0xFFECFDF3)
                      : brandSoft,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  widget.justPaid
                      ? Icons.check_rounded
                      : Icons.receipt_long,
                  size: 38,
                  color: widget.justPaid
                      ? const Color(0xFF22A06B)
                      : brandOrange,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                widget.justPaid ? 'Заказ оформлен' : 'Детали заказа',
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${order.number} · ${money(order.totalAmount)}',
                style: const TextStyle(color: mutedInk, fontSize: 14),
              ),
              const SizedBox(height: 12),
              _statusChip(order.status),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _panel(
          title: 'Статус заказа',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _timeline(order.status),
              const SizedBox(height: 14),
              const Text(
                'Страница обновляется автоматически — как только статус '
                'изменится, вы увидите это здесь.',
                style: TextStyle(fontSize: 12, color: mutedInk, height: 1.45),
              ),
            ],
          ),
        ),
        _panel(
          title: 'Состав заказа',
          child: Column(
            children: [
              for (final line in order.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${line.name}  × ${line.quantity}',
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
                    'Оплачено',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    money(order.totalAmount),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              if (order.bonusAccrued > 0) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF9F5),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFFE1CD)),
                  ),
                  child: Text(
                    '🎁 Начислено бонусов: ${order.bonusAccrued}',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF8A3C12),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (order.payment != null)
          _panel(
            title: 'Оплата',
            child: Row(
              children: [
                const Icon(Icons.payments_outlined, color: mutedInk),
                const SizedBox(width: 10),
                Text(
                  order.payment!.methodLabel,
                  style: const TextStyle(fontSize: 13.5),
                ),
                const Spacer(),
                const Text(
                  'Оплачено',
                  style: TextStyle(
                    color: Color(0xFF22A06B),
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _panel({required String title, required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: lineColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _statusChip(String status) {
    final color = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        statusLabel(status),
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _timeline(String status) {
    final current = _steps.indexOf(status);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var index = 0; index < _steps.length; index++) ...[
          if (index > 0)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(top: 7),
                child: Container(
                  height: 2,
                  color: index <= current ? brandOrange : lineColor,
                ),
              ),
            ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: index <= current ? brandOrange : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: index <= current ? brandOrange : lineColor,
                    width: 2,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              SizedBox(
                width: 62,
                child: Text(
                  statusLabel(_steps[index]),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: index == current
                        ? FontWeight.w700
                        : FontWeight.w400,
                    color: index <= current ? ink : mutedInk,
                  ),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
