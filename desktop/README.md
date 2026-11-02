# Desktop — рабочее место оператора (Electron + TypeScript)

Тёмный интерфейс для сотрудника ресторана: доска заказов в реальном времени,
смена статусов, стоп-лист, звуковой сигнал о новом заказе.

## Запуск

```bash
npm install
npm start
```

`npm start` собирает main/preload (`tsc`) и renderer (esbuild), затем
запускает Electron.

Если npm 12+ блокирует postinstall-скрипты Electron/esbuild:

```bash
npm install-scripts approve electron esbuild
npm rebuild electron esbuild
```

## Сборка

```bash
npm run typecheck   # проверка типов renderer
npm run build       # dist/main.js, dist/preload.js, dist/renderer.js, html, css
```

## Возможности

- вход оператора/администратора (JWT);
- четыре колонки: входящие, готовятся, готовы, завершены;
- кнопки перевода статуса: принять → начать готовку → готов → выдать;
- отмена заказа с подтверждением;
- SignalR: новые заказы и смены статусов приходят без перезагрузки,
  новый заказ сопровождается звуковым сигналом;
- стоп-лист с мгновенным применением и синхронизацией со всеми клиентами;
- поиск по номеру, имени и телефону;
- часы, индикатор соединения, статистика смены;
- горячие клавиши: `F1` — справка, `F5` — обновить, `Esc` — закрыть;
- кастомный titlebar с кнопками окна (IPC + contextIsolation).

## Архитектура

```
src/
├── main.ts       # BrowserWindow, IPC окна, загрузка renderer
├── preload.ts    # contextBridge: безопасный API окна
├── renderer.ts   # UI, REST-клиент, SignalR, состояние
├── index.html    # CSP, точка входа
└── styles.css    # тёмная тема (#1B1F27 / #252A33 / #F26522)
```

Безопасность: `nodeIntegration: false`, `contextIsolation: true`,
внешние ссылки открываются в системном браузере, CSP ограничивает источники.

## Адрес API

По умолчанию `http://127.0.0.1:5080/api/v1`. Для другого адреса:

```js
localStorage.setItem('ff_desktop_api', 'http://192.168.1.50:5080/api/v1')
```

и перезапустить приложение.
