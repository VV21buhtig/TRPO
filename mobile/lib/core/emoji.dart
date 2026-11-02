const Map<String, String> _categoryEmoji = {
  'Бургеры': '🍔',
  'Закуски': '🍟',
  'Напитки': '🥤',
  'Десерты': '🍩',
  'Соусы': '🥫',
};

String emojiFor(String category) => _categoryEmoji[category] ?? '🍽';
