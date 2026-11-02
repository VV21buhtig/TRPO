class User {
  const User({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    required this.bonusBalance,
  });

  final int id;
  final String name;
  final String phone;
  final String role;
  final int bonusBalance;

  bool get isCustomer => role == 'Customer';
  String get roleLabel {
    switch (role) {
      case 'Operator':
        return 'Оператор';
      case 'Admin':
        return 'Администратор';
      default:
        return 'Клиент';
    }
  }

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String? ?? '',
      role: json['role'] as String? ?? 'Customer',
      bonusBalance: (json['bonusBalance'] as num?)?.toInt() ?? 0,
    );
  }
}
