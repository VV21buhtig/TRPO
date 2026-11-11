# Релизы «Онлайн-заказ»

Релизные артефакты не хранятся в Git: они прикладываются к GitHub Releases.
Сборка выполняется скриптом `scripts/build-releases.sh`, результат — в
каталоге `release/` (он исключён из Git).

## Состав релиза 1.0.0

| Платформа | Файл | Запуск |
|---|---|---|
| Windows x64 | `FastFood-Operator-1.0.0-win-x64.zip` | распаковать, запустить `Start FastFood Operator.bat` или `FastFood-Operator.exe` |
| Linux x64 | `FastFood-Operator-1.0.0-linux-x64.tar.gz` | `tar -xzf ... && ./FastFood-Operator-1.0.0-linux-x64/run-fastfood-operator.sh` |
| Android | `FastFood-Operator-1.0.0-android.apk` | установить APK, разрешить установку из неизвестного источника |

Для Windows и Linux desktop-сборка уже настроена на публичный API:

```text
https://lucky-crane-4648.a.tuna.free/api/v1
```

Его можно переопределить переменной окружения `FF_API_URL`.

Android-сборка собрана с:

```text
API_BASE=https://lucky-crane-4648.a.tuna.free/api/v1
```

## Демо-доступ

| Роль | Телефон | Пароль |
|---|---|---|
| Клиент | `+79991234567` | `12345` |
| Оператор | `+79990000001` | `12345` |
| Менеджер | `+79990000002` | `12345` |

SMS-код для клиента: `0000`.

## Сборка

```bash
cd "FastFood projects"
./scripts/build-releases.sh
```

Скрипт:

1. собирает renderer/main/preload desktop-приложения;
2. скачивает официальные Electron 45.2.1 для Windows и Linux;
3. проверяет SHA-256 архивов Electron;
4. упаковывает приложение в переносимые архивы;
5. копирует release APK;
6. создаёт `release/SHA256SUMS.txt`.

Для сборки Android APK:

```bash
cd mobile
flutter build apk --release \
  --dart-define=API_BASE=https://lucky-crane-4648.a.tuna.free/api/v1
```

## Примечания

- Windows: при первом запуске возможен запрос SmartScreen — нажать
  «Подробнее» → «Выполнить в любом случае».
- Linux: если Electron сообщает об ошибке sandbox, запустить
  `./fastfood-operator --no-sandbox` или включить user namespaces.
- Публичный контур должен быть запущен:
  `./scripts/start-public.sh`. Проверка:
  `curl https://lucky-crane-4648.a.tuna.free/api/v1/health`.
- APK подписан debug-ключом и предназначен для демонстрационной установки,
  а не для публикации в Google Play.
