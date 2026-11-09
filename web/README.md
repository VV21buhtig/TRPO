# Web — клиентское SPA «Онлайн-заказ»

React 19 + TypeScript + Vite. Тонкий клиент: вся логика — в REST API.

## Запуск

```bash
npm install
npm run dev
```

`http://127.0.0.1:5173`. API по умолчанию — `http://127.0.0.1:5080/api/v1`.

Переопределение адреса API:

```bash
VITE_API_URL=http://192.168.1.50:5080/api/v1 npm run dev
```

Production-сборка:

```bash
npm run build
npm run preview
```

## Публичный HTTPS без белого IP

Демонстрационный web и API опубликованы одним туннелем Tuna:

- **https://lucky-crane-4648.a.tuna.free**
- API: `/api/v1`, Swagger: `/swagger`.

Сборка для такого режима использует относительный адрес API:

```bash
VITE_API_URL=/api/v1 npm run build
VITE_API_URL=/api/v1 npm run preview -- --host 0.0.0.0 --port 8080
```

В `vite.config.ts` настроены `server.proxy`/`preview.proxy`: `/api`, `/hubs`
(WebSocket SignalR) и `/swagger` уходят на `http://127.0.0.1:5080`, поэтому
браузеру не нужен отдельный адрес API и нет CORS-проблем.

При первом открытии бесплатный Tuna показывает страницу подтверждения —
нажмите **«Посетить»**. Мобильное приложение это предупреждение не показывает.
Полный запуск: `../scripts/start-public.sh`.

## Экраны

- вход по паролю и по SMS-коду (демо-код `0000`);
- меню с поиском, категориями и карточкой блюда;
- корзина с изменением количества;
- оформление: получатель, адрес, комментарий, карта/СБП;
- успешное оформление с таймлайном статуса и начисленными бонусами;
- история заказов с обновлением через SignalR;
- профиль: бонусы, изменение имени, выход.

## Структура

```
src/
├── api.ts                # HTTP-клиент, типы, JWT, авто-refresh
├── state/auth.tsx        # контекст авторизации
├── state/cart.tsx        # корзина в localStorage
├── components/Header.tsx
├── pages/                # Login, Menu, Cart, Checkout, Success, Orders, Profile
├── App.tsx               # маршруты и защита приватных страниц
└── index.css             # дизайн-система (#F26522, светлая тема)
```

## Docker

```bash
docker build --build-arg VITE_API_URL=/api/v1 -t fastfood-web .
```

В составе `infra/docker-compose.yml` SPA отдаётся через Nginx, а `/api` и
`/hubs` проксируются на backend.
