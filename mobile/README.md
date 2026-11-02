# Мобильное приложение «Онлайн-заказ» (Flutter / Android)

Клиент для заказа еды: меню, корзина, оформление и оплата, статус заказа,
история и бонусный счёт. Работает с тем же REST API, что веб- и desktop-клиенты
(`backend/FastFood.Api`).

## Состав

```
mobile/
├── pubspec.yaml
├── analysis_options.yaml
└── lib/
    ├── main.dart
    ├── app.dart                 # MaterialApp, провайдеры, локаль ru_RU
    ├── core/
    │   ├── api_client.dart      # HTTP-клиент REST API
    │   ├── theme.dart           # фирменная тема (#F26522)
    │   ├── format.dart          # деньги, даты
    │   ├── emoji.dart           # иконки категорий
    │   └── order_status.dart    # подписи и цвета статусов
    ├── models/                  # User, MenuItem, Order
    ├── state/                   # AuthState, CartState (ChangeNotifier)
    └── screens/
        ├── login_screen.dart
        ├── root_screen.dart     # нижняя навигация: Меню / Заказы / Профиль
        ├── menu_screen.dart
        ├── cart_screen.dart
        ├── checkout_screen.dart
        ├── order_status_screen.dart
        ├── orders_screen.dart
        └── profile_screen.dart
```

## Требования

- Flutter 3.24+ (Dart 3.3+), Android SDK;
- запущенный backend (см. `../backend/README.md`).

## Первый запуск

Платформенные каталоги (`android/`, `ios/`) генерируются Flutter SDK — в
репозитории хранится только Dart-код, чтобы не тащить gradle-обвязку.

```bash
cd mobile
flutter create --platforms=android .
flutter pub get
```

### Разрешения Android

В `android/app/src/main/AndroidManifest.xml`:

1. Перед `<application>` добавить доступ в интернет:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

2. В теге `<application>` разрешить HTTP для локальной разработки:

```xml
<application
    android:usesCleartextTraffic="true"
    ... >
```

### Адрес API

По умолчанию используется `http://10.0.2.2:5080/api/v1` — это localhost
компьютера с точки зрения Android-эмулятора. Для реального планшета укажите
IP компьютера в локальной сети:

```bash
flutter run --dart-define=API_BASE=http://192.168.1.50:5080/api/v1
```

Backend при этом должен слушать все интерфейсы:

```bash
cd ../backend/FastFood.Api
dotnet run --urls http://0.0.0.0:5080
```

### Сборка APK

```bash
flutter build apk --release \
  --dart-define=API_BASE=http://192.168.1.50:5080/api/v1
```

APK: `build/app/outputs/flutter-apk/app-release.apk`.

## Демо-доступ

| Роль | Телефон | Пароль |
| --- | --- | --- |
| Клиент | `+79991234567` | `12345` |
| Оператор | `+79990000001` | `12345` |

SMS-вход работает в демо-режиме: код `0000` (показывается в ответе API
и в подсказке на экране входа).

## Что реализовано

- вход по паролю и по SMS-коду, сохранение JWT в `SharedPreferences`;
- меню с категориями, поиском и карточкой блюда;
- корзина с изменением количества и подсчётом суммы;
- оформление заказа: адрес, комментарий, карта или СБП;
- создание заказа и оплата двумя вызовами REST API;
- экран статуса с таймлайном и автообновлением каждые 10 секунд;
- история заказов с обновлением по pull-to-refresh;
- профиль: бонусный счёт, изменение имени, выход;
- состояния загрузки/ошибки и повтор запроса при сбое сети.

Push-уведомления (FCM) в учебном прототипе не подключаются: для них нужен
Firebase-проект и `google-services.json`. Архитектурно место под них
предусмотрено — фоновые уведомления о смене статуса заказа.
