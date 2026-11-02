import 'package:intl/intl.dart';

final NumberFormat _moneyFormat = NumberFormat.currency(
  locale: 'ru_RU',
  symbol: '₽',
  decimalDigits: 0,
);

String money(num value) => _moneyFormat.format(value);

String twoDigits(int value) => value.toString().padLeft(2, '0');

String formatDateTime(DateTime value) {
  final local = value.toLocal();
  return '${twoDigits(local.day)}.${twoDigits(local.month)}, '
      '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
}

String formatTime(DateTime value) {
  final local = value.toLocal();
  return '${twoDigits(local.hour)}:${twoDigits(local.minute)}';
}
