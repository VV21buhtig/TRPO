import 'package:flutter_test/flutter_test.dart';

import 'package:fastfood_mobile/core/format.dart';

void main() {
  test('сумма форматируется в рублях', () {
    expect(money(790), contains('790'));
    expect(money(0), contains('0'));
  });

  test('дата и время форматируются с ведущими нулями', () {
    final value = DateTime(2026, 11, 2, 9, 5);
    expect(formatDateTime(value), '02.11, 09:05');
    expect(formatTime(value), '09:05');
  });
}
