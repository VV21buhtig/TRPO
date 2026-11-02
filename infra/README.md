# Infra — развёртывание комплекса

Docker Compose: PostgreSQL 16, Redis 7, REST API, SPA и Nginx-шлюз.

## Запуск

```bash
cp .env.example .env
# отредактируйте POSTGRES_PASSWORD и JWT_KEY
docker compose up --build
```

| Адрес | Что |
| --- | --- |
| `http://localhost:8080` | веб-приложение |
| `http://localhost:8080/api/v1/health` | health-check API |
| `http://localhost:8080/swagger` | Swagger UI |

Nginx проксирует `/api/` и `/swagger/` на `api:8080`, `/hubs/` — с поддержкой
WebSocket (SignalR), остальное — на контейнер `web` (Nginx со SPA).

## Переменные

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `fastfood` | пароль БД |
| `JWT_KEY` | демо-значение | секрет подписи JWT |

Перед публикацией обязательно замените оба значения.

## Остановка

```bash
docker compose down          # контейнеры
docker compose down -v       # вместе с данными PostgreSQL/Redis
```
