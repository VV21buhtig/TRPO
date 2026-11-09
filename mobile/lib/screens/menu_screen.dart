import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/emoji.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/menu_item.dart';
import '../state/cart_state.dart';
import 'cart_screen.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  final TextEditingController _search = TextEditingController();

  List<MenuItem> _items = [];
  bool _loading = true;
  String? _error;
  String _category = 'Все';
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final items = await context.read<ApiClient>().menuItems();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
        if (_category != 'Все' &&
            !_items.any((item) => item.category == _category)) {
          _category = 'Все';
        }
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _loading = false;
      });
    }
  }

  List<String> get _categories {
    final values = <String>{'Все'};
    for (final item in _items) {
      values.add(item.category);
    }
    return values.toList();
  }

  List<MenuItem> get _visible {
    return _items.where((item) {
      final byCategory = _category == 'Все' || item.category == _category;
      final byQuery =
          _query.isEmpty ||
          item.name.toLowerCase().contains(_query) ||
          item.description.toLowerCase().contains(_query);
      return byCategory && byQuery;
    }).toList();
  }

  Future<void> _openItem(MenuItem item) async {
    final cart = context.read<CartState>();

    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetContext) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: EdgeInsets.fromLTRB(
            22,
            14,
            22,
            24 + MediaQuery.of(sheetContext).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: lineColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Center(
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF0E5),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    emojiFor(item.category),
                    style: const TextStyle(fontSize: 62),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xFFF0F1F4),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  item.category,
                  style: const TextStyle(fontSize: 12, color: mutedInk),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                item.name,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                item.description,
                style: const TextStyle(color: mutedInk, height: 1.5),
              ),
              const SizedBox(height: 8),
              Text(
                '${item.calories} ккал',
                style: const TextStyle(fontSize: 12.5, color: mutedInk),
              ),
              if (item.discountPercent > 0) ...[
                const SizedBox(height: 5),
                Text(
                  '${item.promotionTitle ?? "Акция"} · −${item.discountPercent}%',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFC34B15),
                  ),
                ),
              ],
              const SizedBox(height: 20),
              Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        money(item.price),
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (item.discountPercent > 0)
                        Text(
                          money(item.basePrice),
                          style: const TextStyle(
                            fontSize: 12,
                            color: mutedInk,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                    ],
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () {
                      cart.add(item);
                      Navigator.of(sheetContext).pop();
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('${item.name} — в корзине')),
                      );
                    },
                    child: const Text('В корзину'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  void _add(MenuItem item) {
    context.read<CartState>().add(item);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${item.name} — в корзине'),
        duration: const Duration(milliseconds: 1200),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartState>();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Онлайн-заказ'),
            SizedBox(height: 2),
            Text(
              'Доставка 25–40 минут',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w400,
                color: mutedInk,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Корзина',
            onPressed: () => Navigator.of(context)
                .push(MaterialPageRoute(builder: (_) => const CartScreen())),
            icon: Badge(
              isLabelVisible: cart.count > 0,
              label: Text('${cart.count}'),
              child: const Icon(Icons.shopping_cart_outlined),
            ),
          ),
          const SizedBox(width: 10),
        ],
      ),
      floatingActionButton: cart.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const CartScreen())),
              backgroundColor: ink,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.shopping_bag_outlined),
              label: Text('${cart.count} · ${money(cart.total)}'),
            ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _ErrorView(message: _error!, onRetry: _load)
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 110),
                children: [
                  _hero(),
                  const SizedBox(height: 18),
                  TextField(
                    controller: _search,
                    onChanged: (value) =>
                        setState(() => _query = value.trim().toLowerCase()),
                    decoration: const InputDecoration(
                      hintText: 'Найти блюдо',
                      prefixIcon: Icon(Icons.search, color: mutedInk),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    height: 42,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _categories.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final category = _categories[index];
                        final selected = category == _category;
                        return ChoiceChip(
                          label: Text(category),
                          selected: selected,
                          showCheckmark: false,
                          onSelected: (_) =>
                              setState(() => _category = category),
                          selectedColor: ink,
                          backgroundColor: Colors.white,
                          side: const BorderSide(color: lineColor),
                          labelStyle: TextStyle(
                            color: selected ? Colors.white : mutedInk,
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_visible.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Text(
                          'Ничего не нашлось',
                          style: TextStyle(color: mutedInk),
                        ),
                      ),
                    )
                  else
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _visible.length,
                      gridDelegate:
                          const SliverGridDelegateWithMaxCrossAxisExtent(
                            maxCrossAxisExtent: 280,
                            mainAxisExtent: 224,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                          ),
                      itemBuilder: (context, index) {
                        final item = _visible[index];
                        return _dishCard(item);
                      },
                    ),
                ],
              ),
            ),
    );
  }

  Widget _hero() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 16, 22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFE9DB), Color(0xFFFFF6EF), Colors.white],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'Доставка 25–40 минут',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: brandOrangeDark,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Вкусно, быстро,\nбез очереди',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Соберите заказ в приложении — приготовим '
                  'к вашему приходу или привезём домой.',
                  style: TextStyle(
                    fontSize: 12.5,
                    color: Color(0xFF5A5F68),
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          const Text('🍔', style: TextStyle(fontSize: 64)),
        ],
      ),
    );
  }

  Widget _dishCard(MenuItem item) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => _openItem(item),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 92,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF0E5),
                  borderRadius: BorderRadius.circular(12),
                ),
                alignment: Alignment.center,
                child: Text(
                  emojiFor(item.category),
                  style: const TextStyle(fontSize: 46),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                item.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '${item.calories} ккал',
                style: const TextStyle(fontSize: 11, color: mutedInk),
              ),
              if (item.discountPercent > 0) ...[
                const SizedBox(height: 2),
                Text(
                  '${item.promotionTitle ?? "Акция"} · −${item.discountPercent}%',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFFC34B15),
                  ),
                ),
              ],
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          money(item.price),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (item.discountPercent > 0)
                          Text(
                            money(item.basePrice),
                            style: const TextStyle(
                              fontSize: 10,
                              color: mutedInk,
                              decoration: TextDecoration.lineThrough,
                            ),
                          ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 32,
                    height: 32,
                    child: FilledButton(
                      onPressed: () => _add(item),
                      style: FilledButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(32, 32),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Icon(Icons.add, size: 19),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 56, color: mutedInk),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Повторить')),
          ],
        ),
      ),
    );
  }
}
