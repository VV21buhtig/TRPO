# Backend — REST API «Онлайн-заказ»

ASP.NET Core (.NET 10), Minimal API, EF Core, JWT, SignalR.

## Запуск

```bash
cd FastFood.Api
dotnet run --urls http://0.0.0.0:5080
```

- API: `http://127.0.0.1:5080/api/v1`
- Swagger: `http://127.0.0.1:5080/swagger`
- БД по умолчанию: SQLite `fastfood.db` (создаётся и заполняется при старте).

Публичный демонстрационный HTTPS-адрес (Tuna, без белого IP):

- API: `https://lucky-crane-4648.a.tuna.free/api/v1`
- Swagger: `https://lucky-crane-4648.a.tuna.free/swagger`
- health-check: `https://lucky-crane-4648.a.tuna.free/api/v1/health`

Запуск API + web + туннеля: `../scripts/start-public.sh`.

## Конфигурация

`appsettings.json`:

```json
{
  "ConnectionStrings": { "Default": "Data Source=fastfood.db" },
  "Jwt": {
    "Key": "<JWT-ключ-не-короче-32-символов>",
    "Issuer": "FastFood.Api",
    "Audience": "FastFood.Clients"
  }
}
```

Переменные окружения (double underscore — вложенность):

| Переменная | Назначение |
| --- | --- |
| `ConnectionStrings__Default` | строка подключения |
| `UsePostgres` | `true` — использовать PostgreSQL |
| `Jwt__Key` | секрет подписи (≥ 32 байт) |
| `Jwt__Issuer`, `Jwt__Audience` | параметры токена |
| `ASPNETCORE_URLS` | адреса прослушивания |

Если строка подключения начинается с `Host=`, PostgreSQL включается
автоматически. Пример:

```bash
UsePostgres=true \
ConnectionStrings__Default="Host=localhost;Database=fastfood;Username=fastfood;Password=fastfood" \
dotnet run
```

## Структура

```
FastFood.Api/
├── Program.cs            # DI, JWT, CORS, Swagger, SignalR, seed
├── Endpoints/            # всё REST API (Minimal API)
├── Contracts/            # DTO запросов
├── Models/               # домен: User, MenuItem, Order, Payment, Promotion
├── Data/                 # DbContext и демо-данные
├── Services/             # выпуск JWT
└── Hubs/OrdersHub.cs     # группы операторов и заказов
```

## Роли и доступ

- `Customer` — заказ, оплата, свои заказы, бонусы, профиль;
- `Operator` / `Administrator` — все заказы, смена статусов, стоп-лист;
- `Administrator` — дополнительно акции, отчёты, журнал действий и сотрудники.

Сотрудник не удаляется физически: менеджер блокирует учётную запись
(`IsActive = false`), после чего сервер отклоняет и новые входы, и уже
выданный JWT. Разблокировка возвращает доступ сразу. Нельзя заблокировать
самого себя или последнего активного менеджера.

Акция может быть информационной (`Scope = None`) либо применяться ко всем
блюдам, категории или конкретному блюду. Для привязанной акции API возвращает
в меню `basePrice`, `discountPercent` и `promotionTitle`, а при создании
заказа рассчитывает цену со скидкой на сервере.

Пароли хранятся как PBKDF2-хеши (`PasswordHasher<User>`), JWT подписывается
HMAC-SHA256, access-токен живёт 15 минут, refresh — 30 дней. Клиенты
автоматически обновляют access-токен при ответе 401.

## Smoke-тест

```bash
cd ..            # каталог backend
python3 smoke_test.py
```

Тест использует стандартную библиотеку Python и проверяет 36+ запросов:
health-check, вход, каталог, создание заказа, оплату, повторную оплату,
историю, смену статуса оператором, стоп-лист, запрет заказа из стоп-листа,
акции и отчёт администратора, управление сотрудниками, блокировку доступа,
разграничение доступа, SMS-вход.

## Docker

```bash
docker build -t fastfood-api .
docker run -p 5080:8080 \
  -e UsePostgres=true \
  -e ConnectionStrings__Default="Host=host.docker.internal;Database=fastfood;Username=fastfood;Password=fastfood" \
  fastfood-api
```
