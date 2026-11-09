import 'package:flutter_test/flutter_test.dart';
import 'package:fastfood_mobile/app.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('при отсутствии токена открывается экран входа', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(const FastFoodApp());
    await tester.pumpAndSettle();

    expect(find.text('Вход в личный кабинет'), findsOneWidget);
    expect(find.text('Войти'), findsOneWidget);
    expect(find.text('Демо-доступ'), findsOneWidget);
  });
}
