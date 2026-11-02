import 'package:flutter/foundation.dart';

import '../models/menu_item.dart';

class CartLine {
  CartLine({required this.item, this.quantity = 1});

  final MenuItem item;
  int quantity;

  double get total => item.price * quantity;
}

class CartState extends ChangeNotifier {
  final List<CartLine> _lines = [];

  List<CartLine> get lines => List.unmodifiable(_lines);
  bool get isEmpty => _lines.isEmpty;

  int get count => _lines.fold(0, (sum, line) => sum + line.quantity);
  double get total => _lines.fold(0, (sum, line) => sum + line.total);

  int quantityOf(int menuItemId) {
    for (final line in _lines) {
      if (line.item.id == menuItemId) return line.quantity;
    }
    return 0;
  }

  void add(MenuItem item) {
    final index = _lines.indexWhere((line) => line.item.id == item.id);
    if (index >= 0) {
      _lines[index].quantity += 1;
    } else {
      _lines.add(CartLine(item: item));
    }
    notifyListeners();
  }

  void increment(int menuItemId) {
    final index = _lines.indexWhere((line) => line.item.id == menuItemId);
    if (index < 0) return;
    _lines[index].quantity += 1;
    notifyListeners();
  }

  void decrement(int menuItemId) {
    final index = _lines.indexWhere((line) => line.item.id == menuItemId);
    if (index < 0) return;
    if (_lines[index].quantity <= 1) {
      _lines.removeAt(index);
    } else {
      _lines[index].quantity -= 1;
    }
    notifyListeners();
  }

  void remove(int menuItemId) {
    _lines.removeWhere((line) => line.item.id == menuItemId);
    notifyListeners();
  }

  void clear() {
    _lines.clear();
    notifyListeners();
  }
}
