class MenuItem {
  const MenuItem({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.basePrice,
    required this.discountPercent,
    required this.promotionTitle,
    required this.calories,
    required this.category,
    required this.isInStopList,
  });

  final int id;
  final String name;
  final String description;
  final double price;
  final double basePrice;
  final int discountPercent;
  final String? promotionTitle;
  final int calories;
  final String category;
  final bool isInStopList;

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      description: json['description'] as String? ?? '',
      price: (json['price'] as num).toDouble(),
      basePrice: (json['basePrice'] as num?)?.toDouble() ??
          (json['price'] as num).toDouble(),
      discountPercent: (json['discountPercent'] as num?)?.toInt() ?? 0,
      promotionTitle: json['promotionTitle'] as String?,
      calories: (json['calories'] as num?)?.toInt() ?? 0,
      category: json['category'] as String? ?? '',
      isInStopList: json['isInStopList'] as bool? ?? false,
    );
  }
}
