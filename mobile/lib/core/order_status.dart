import 'package:flutter/material.dart';

const Map<String, String> statusLabels = {
  'New': 'Новый',
  'Accepted': 'Принят',
  'Cooking': 'Готовится',
  'Ready': 'Готов',
  'Completed': 'Выполнен',
  'Cancelled': 'Отменён',
};

const Map<String, Color> statusColors = {
  'New': Color(0xFF2F6FED),
  'Accepted': Color(0xFFF59E0B),
  'Cooking': Color(0xFFF26522),
  'Ready': Color(0xFF22A06B),
  'Completed': Color(0xFF6B7280),
  'Cancelled': Color(0xFFF04438),
};

String statusLabel(String status) => statusLabels[status] ?? status;

Color statusColor(String status) => statusColors[status] ?? const Color(0xFF6B7280);
