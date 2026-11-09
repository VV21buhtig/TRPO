# Desktop — рабочее место оператора и менеджера (Electron + TypeScript)

Тёмный интерфейс для сотрудника ресторана: доска заказов в реальном времени,
смена статусов, стоп-лист, звуковой сигнал о новом заказе. Для роли
`Administrator` доступна вкладка **«Управление»** с отчётами, журналом
действий, сотрудниками и акциями.

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
- отмена заказа в собственном модальном окне с необязательной причиной;
  отмена сохраняется в журнале с ID и ФИО сотрудника;
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

По умолчанию `http://127.0.0.1:5080/api/v1`. Для другого адреса можно
задать переменную окружения перед запуском.

Публичный HTTPS-адрес (Tuna, без белого IP):

```bash
# Linux / macOS
FF_API_URL=https://lucky-crane-4648.a.tuna.free/api/v1 npm start
```

```bat
:: Windows (cmd)
set FF_API_URL=https://lucky-crane-4648.a.tuna.free/api/v1
npm start
```

Локальный адрес в одной сети:

```bash
FF_API_URL=http://192.168.1.50:5080/api/v1 npm start
```

Альтернатива без переменной окружения — открыть DevTools и выполнить:

```js
localStorage.setItem('ff_desktop_api', 'https://lucky-crane-4648.a.tuna.free/api/v1')
location.reload()
```

## Windows

На Windows 11 нужен Node.js 20+ (проверено на Node.js 26) и интернет для
первой установки Electron:

```bat
cd desktop
npm install
set FF_API_URL=https://lucky-crane-4648.a.tuna.free/api/v1
npm start
```

Проверка API с Windows:

```bat
curl https://lucky-crane-4648.a.tuna.free/api/v1/health
```
