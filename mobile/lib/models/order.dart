class OrderLine {
  const OrderLine({
    required this.menuItemId,
    required this.name,
    required this.quantity,
    required this.price,
  });

  final int menuItemId;
  final String name;
  final int quantity;
  final double price;

  double get total => price * quantity;

  factory OrderLine.fromJson(Map<String, dynamic> json) {
    return OrderLine(
      menuItemId: (json['menuItemId'] as num).toInt(),
      name: json['name'] as String? ?? '',
      quantity: (json['quantity'] as num).toInt(),
      price: (json['price'] as num).toDouble(),
    );
  }
}

class PaymentInfo {
  const PaymentInfo({required this.method, required this.status});

  final String method;
  final String status;

  String get methodLabel => method == 'SBP' ? 'СБП' : 'Банковская карта';

  factory PaymentInfo.fromJson(Map<String, dynamic> json) {
    return PaymentInfo(
      method: json['method'] as String? ?? '',
      status: json['status'] as String? ?? '',
    );
  }
}

class Order {
  const Order({
    required this.id,
    required this.number,
    required this.status,
    required this.totalAmount,
    required this.bonusAccrued,
    required this.comment,
    required this.createdAt,
    required this.customerName,
    required this.customerPhone,
    required this.items,
    required this.payment,
  });

  final int id;
  final String number;
  final String status;
  final double totalAmount;
  final int bonusAccrued;
  final String? comment;
  final DateTime createdAt;
  final String? customerName;
  final String? customerPhone;
  final List<OrderLine> items;
  final PaymentInfo? payment;

  bool get isPaid => payment != null;

  factory Order.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    final items = (json['items'] as List<dynamic>? ?? const [])
        .map((item) => OrderLine.fromJson(item as Map<String, dynamic>))
        .toList();

    return Order(
      id: (json['id'] as num).toInt(),
      number: json['number'] as String? ?? '',
      status: json['status'] as String? ?? 'New',
      totalAmount: (json['totalAmount'] as num).toDouble(),
      bonusAccrued: (json['bonusAccrued'] as num?)?.toInt() ?? 0,
      comment: json['comment'] as String?,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ??
              DateTime.now(),
      customerName: customer?['name'] as String?,
      customerPhone: customer?['phone'] as String?,
      items: items,
      payment: payment == null ? null : PaymentInfo.fromJson(payment),
    );
  }
}
