import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

/* ------------------------------------------------------------------ */
/*  Типы, совпадающие с контрактами REST API                           */
/* ------------------------------------------------------------------ */

type Role = "Customer" | "Operator" | "Admin";

type User = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  bonusBalance: number;
};

type MenuItem = {
  id: number;
  name: string;
  description: string;
  price: number;
  calories: number;
  category: string;
  isInStopList: boolean;
};

type OrderLine = {
  menuItemId: number;
  name: string;
  quantity: number;
  price: number;
};

type Order = {
  id: number;
  number: string;
  status: string;
  totalAmount: number;
  bonusAccrued: number;
  comment: string | null;
  createdAt: string;
  customer: { id: number; name: string; phone: string } | null;
  items: OrderLine[];
  payment: { method: string; status: string } | null;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
};

type ApiOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
};

declare global {
  interface Window {
    desktop?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      version: () => Promise<string>;
      platform: string;
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Конфигурация и состояние                                           */
/* ------------------------------------------------------------------ */

const TOKEN_KEY = "ff_desktop_token";
const REFRESH_KEY = "ff_desktop_refresh";
const USER_KEY = "ff_desktop_user";

const API = (
  localStorage.getItem("ff_desktop_api") ?? "http://127.0.0.1:5080/api/v1"
).replace(/\/+$/, "");
const HUB_URL = API.replace(/\/api\/v1$/, "") + "/hubs/orders";

const STATUS_LABELS: Record<string, string> = {
  New: "Новый",
  Accepted: "Принят",
  Cooking: "Готовится",
  Ready: "Готов",
  Completed: "Выполнен",
  Cancelled: "Отменён",
};

const NEXT_STATUS: Record<string, { status: string; label: string }> = {
  New: { status: "Accepted", label: "Принять" },
  Accepted: { status: "Cooking", label: "Готовить" },
  Cooking: { status: "Ready", label: "Готов" },
  Ready: { status: "Completed", label: "Выдать" },
};

const COLUMNS = [
  { key: "incoming", title: "Входящие", tone: "incoming", statuses: ["New", "Accepted"] },
  { key: "cooking", title: "Готовятся", tone: "cooking", statuses: ["Cooking"] },
  { key: "ready", title: "Готовы", tone: "ready", statuses: ["Ready"] },
  { key: "done", title: "Завершены", tone: "done", statuses: ["Completed", "Cancelled"] },
] as const;

const EMOJI: Record<string, string> = {
  Бургеры: "🍔",
  Закуски: "🍟",
  Напитки: "🥤",
  Десерты: "🍩",
  Соусы: "🥫",
};

function readUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as User | null;
  } catch {
    return null;
  }
}

const state = {
  token: localStorage.getItem(TOKEN_KEY) ?? "",
  refreshToken: localStorage.getItem(REFRESH_KEY) ?? "",
  user: readUser(),
  orders: [] as Order[],
  menu: [] as MenuItem[],
  view: "orders" as "orders" | "stoplist",
  search: "",
  busyOrders: new Set<number>(),
  busyMenu: new Set<number>(),
};

const root = document.getElementById("root");
if (!root) throw new Error("Не найден корневой элемент #root");
const app = root;

let connection: HubConnection | null = null;
let reconnectTimer: number | undefined;
let stopped = false;
let clockTimer: number | undefined;

/* ------------------------------------------------------------------ */
/*  Утилиты                                                            */
/* ------------------------------------------------------------------ */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Не найден элемент ${selector}`);
  return element;
}

function money(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toast(message: string, isError = false): void {
  const element = document.createElement("div");
  element.className = isError ? "toast error" : "toast";
  element.textContent = message;
  document.body.append(element);
  window.setTimeout(() => element.remove(), 3200);
}

function beep(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    window.setTimeout(() => void context.close(), 500);
  } catch {
    /* звук недоступен — не критично */
  }
}

/* ------------------------------------------------------------------ */
/*  HTTP-клиент                                                        */
/* ------------------------------------------------------------------ */

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response = await sendHttp(path, options, state.token);

  if (response.status === 401 && options.auth !== false && state.refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await sendHttp(path, options, state.token);
    }
  }

  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string; title?: string };
      message = data.error ?? data.title ?? message;
    } catch {
      /* тело ответа не JSON */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function sendHttp(
  path: string,
  options: ApiOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(API + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(API + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (!response.ok) return false;

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    state.token = data.accessToken;
    state.refreshToken = data.refreshToken;
    persist();
    return true;
  } catch {
    return false;
  }
}

function persist(): void {
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);

  if (state.refreshToken) localStorage.setItem(REFRESH_KEY, state.refreshToken);
  else localStorage.removeItem(REFRESH_KEY);

  if (state.user) localStorage.setItem(USER_KEY, JSON.stringify(state.user));
  else localStorage.removeItem(USER_KEY);
}

/* ------------------------------------------------------------------ */
/*  Разметка                                                           */
/* ------------------------------------------------------------------ */

function titlebar(): string {
  return `
    <div class="titlebar">
      <div class="brand">
        <span class="brand-mark">О</span>
        <span class="brand-text">Онлайн-заказ</span>
        <span class="brand-sub">оператор</span>
      </div>
      <div class="titlebar-caption">Рабочее место оператора</div>
      <div class="window-controls">
        <button data-win="min" title="Свернуть">—</button>
        <button data-win="max" title="Развернуть">▢</button>
        <button data-win="close" class="close" title="Закрыть">✕</button>
      </div>
    </div>`;
}

function shell(): string {
  const user = state.user;
  const initials = (user?.name ?? "О")
    .split(" ")
    .map((part) => part[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const role = user?.role === "Admin" ? "Администратор" : "Оператор";

  return `
    ${titlebar()}
    <div class="shell">
      <aside class="sidebar">
        <div class="operator-card">
          <div class="avatar">${esc(initials)}</div>
          <div class="operator-info">
            <strong>${esc(user?.name ?? "")}</strong>
            <span>${role}</span>
          </div>
        </div>
        <nav class="nav">
          <button class="nav-item active" data-view="orders">
            <span>🧾</span> Заказы <b id="nav-badge" class="hidden">0</b>
          </button>
          <button class="nav-item" data-view="stoplist">
            <span>⛔</span> Стоп-лист
          </button>
        </nav>
        <div class="sidebar-footer">
          <div class="keyhint">F1 — горячие клавиши<br />F5 — обновить данные</div>
          <button class="logout" id="logout">Выйти</button>
        </div>
      </aside>

      <main class="content">
        <header class="topbar">
          <div>
            <h1 id="page-title">Заказы</h1>
            <p class="muted" id="page-subtitle">Все заказы в реальном времени</p>
          </div>
          <div class="topbar-actions">
            <label class="search-box" id="search-box">
              <span>⌕</span>
              <input id="search" placeholder="Номер, клиент, телефон" autocomplete="off" />
            </label>
            <button class="icon-button" id="refresh" title="Обновить (F5)">⟳</button>
            <span class="live offline" id="live"><i></i><span>Офлайн</span></span>
            <span class="clock" id="clock">--:--:--</span>
          </div>
        </header>

        <section class="stats" id="stats"></section>
        <section class="board" id="board"></section>
        <section class="stoplist hidden" id="stoplist"></section>
      </main>
    </div>

    <div class="overlay hidden" id="help">
      <div class="help-card">
        <div class="help-head">
          <h2>Горячие клавиши</h2>
          <button class="icon-button" id="help-close" title="Закрыть">✕</button>
        </div>
        <ul>
          <li><kbd>F1</kbd><span>Показать / скрыть эту справку</span></li>
          <li><kbd>F5</kbd><span>Обновить заказы и стоп-лист</span></li>
          <li><kbd>Esc</kbd><span>Закрыть справку</span></li>
        </ul>
        <p>Статусы меняются кнопками на карточке заказа. Новые заказы приходят по SignalR автоматически и сопровождаются звуковым сигналом.</p>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  Вход                                                               */
/* ------------------------------------------------------------------ */

function renderLogin(message = ""): void {
  stopRealtime();

  app.innerHTML = `
    ${titlebar()}
    <div class="login">
      <form class="login-card" id="login-form">
        <div class="login-brand">
          <span class="brand-mark" style="width:34px;height:34px;border-radius:10px;font-size:16px">О</span>
          <div>
            <strong style="font-size:14px">Онлайн-заказ</strong>
            <div class="muted" style="font-size:11px">рабочее место оператора</div>
          </div>
        </div>
        <h1>Вход в систему</h1>
        <p>Принимайте заказы, меняйте статусы и управляйте стоп-листом в реальном времени.</p>
        ${message ? `<div class="login-error">${esc(message)}</div>` : ""}
        <div id="login-error"></div>
        <label class="field">Телефон
          <input name="phone" value="+79990000001" autocomplete="username" />
        </label>
        <label class="field">Пароль
          <input name="password" type="password" value="12345" autocomplete="current-password" />
        </label>
        <button class="btn primary wide" type="submit">Войти</button>
        <div class="login-hint">
          <strong>Демо-доступ</strong><br />
          Оператор: +79990000001 / 12345<br />
          Администратор: +79990000002 / 12345
        </div>
      </form>
    </div>`;

  const form = document.querySelector<HTMLFormElement>("#login-form");
  if (!form) return;

  const submit = form.querySelector<HTMLButtonElement>("button[type=submit]");
  const errorBox = document.querySelector<HTMLElement>("#login-error");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const phone = String(data.get("phone") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (!phone || !password) {
      if (errorBox) errorBox.innerHTML = `<div class="login-error">Введите телефон и пароль</div>`;
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Входим…";
    }

    try {
      const response = await request<LoginResponse>("/auth/login", {
        method: "POST",
        body: { phone, password },
        auth: false,
      });

      if (response.user.role === "Customer") {
        throw new Error("Нужен аккаунт оператора или администратора");
      }

      state.token = response.accessToken;
      state.refreshToken = response.refreshToken;
      state.user = response.user;
      persist();
      startApp();
    } catch (error) {
      if (errorBox) {
        errorBox.innerHTML = `<div class="login-error">${esc(
          error instanceof Error ? error.message : "Не удалось войти",
        )}</div>`;
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Войти";
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Основной экран                                                     */
/* ------------------------------------------------------------------ */

function startApp(): void {
  if (!state.user) {
    renderLogin();
    return;
  }

  app.innerHTML = shell();
  switchView("orders");
  startClock();
  setLive(false);
  void refreshAll();
  void connectRealtime();
}

function switchView(view: "orders" | "stoplist"): void {
  state.view = view;

  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  document.getElementById("board")?.classList.toggle("hidden", view !== "orders");
  document.getElementById("stats")?.classList.toggle("hidden", view !== "orders");
  document.getElementById("stoplist")?.classList.toggle("hidden", view !== "stoplist");
  document.getElementById("search-box")?.classList.toggle("hidden", view !== "orders");

  const title = document.getElementById("page-title");
  const subtitle = document.getElementById("page-subtitle");
  if (title) title.textContent = view === "orders" ? "Заказы" : "Стоп-лист";
  if (subtitle) {
    subtitle.textContent =
      view === "orders"
        ? "Все заказы в реальном времени"
        : "Управление доступностью блюд";
  }
}

/* ------------------------------------------------------------------ */
/*  Загрузка данных                                                    */
/* ------------------------------------------------------------------ */

async function loadOrders(): Promise<void> {
  state.orders = await request<Order[]>("/orders");
  renderBoard();
  renderStats();
  updateBadge();
}

async function loadMenu(): Promise<void> {
  state.menu = await request<MenuItem[]>("/menu-items?includeStopList=true");
  renderStopList();
}

async function refreshAll(): Promise<void> {
  if (!state.user) return;
  try {
    await Promise.all([loadOrders(), loadMenu()]);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401) {
      logout("Сессия истекла — войдите снова");
      return;
    }
    toast(error instanceof Error ? error.message : "Ошибка загрузки", true);
  }
}

function upsertOrder(order: Order): void {
  const exists = state.orders.some((item) => item.id === order.id);
  state.orders = exists
    ? state.orders.map((item) => (item.id === order.id ? order : item))
    : [order, ...state.orders];
}

/* ------------------------------------------------------------------ */
/*  Отрисовка                                                          */
/* ------------------------------------------------------------------ */

function orderCard(order: Order): string {
  const busy = state.busyOrders.has(order.id);
  const next = NEXT_STATUS[order.status];
  const cancellable = ["New", "Accepted", "Cooking"].includes(order.status);
  const search = `${order.number} ${order.customer?.name ?? ""} ${order.customer?.phone ?? ""}`.toLowerCase();

  return `
    <article class="order-card status-${esc(order.status)}" data-id="${order.id}" data-search="${esc(search)}">
      <div class="order-top">
        <span class="order-number">${esc(order.number)}</span>
        <span class="status ${esc(order.status)}">${esc(STATUS_LABELS[order.status] ?? order.status)}</span>
      </div>
      <div class="order-meta">
        <span class="pill ${order.payment ? "paid" : "unpaid"}">${order.payment ? "Оплачен" : "Не оплачен"}</span>
        <span class="order-time">${clockTime(order.createdAt)}</span>
      </div>
      <div class="order-customer">
        <strong>${esc(order.customer?.name ?? "Гость")}</strong>
        <span>${esc(order.customer?.phone ?? "")}</span>
      </div>
      <ul class="order-items">
        ${order.items
          .map(
            (line) => `<li>
              <span>${esc(line.name)} <span class="qty">× ${line.quantity}</span></span>
              <span>${money(line.price * line.quantity)}</span>
            </li>`,
          )
          .join("")}
      </ul>
      ${order.comment ? `<div class="order-comment">💬 ${esc(order.comment)}</div>` : ""}
      <div class="order-total"><span>Итого</span><strong>${money(order.totalAmount)}</strong></div>
      <div class="order-actions">
        ${
          next
            ? `<button class="btn primary" data-action="advance" data-id="${order.id}" data-next="${next.status}" ${
                busy ? "disabled" : ""
              }>${busy ? "…" : next.label}</button>`
            : ""
        }
        ${
          cancellable
            ? `<button class="btn ghost-danger" data-action="cancel" data-id="${order.id}" ${
                busy ? "disabled" : ""
              }>Отменить</button>`
            : ""
        }
      </div>
    </article>`;
}

function renderBoard(): void {
  const board = document.getElementById("board");
  if (!board) return;

  board.innerHTML = COLUMNS.map((column) => {
    const list = state.orders
      .filter((order) => (column.statuses as readonly string[]).includes(order.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return `
      <section class="column">
        <div class="column-head">
          <i class="${column.tone}"></i>
          <h2>${column.title}</h2>
          <span>${list.length}</span>
        </div>
        ${
          list.length
            ? list.map(orderCard).join("")
            : `<div class="column-empty">Пока пусто</div>`
        }
      </section>`;
  }).join("");

  applySearch();
}

function renderStats(): void {
  const stats = document.getElementById("stats");
  if (!stats) return;

  const count = (...statuses: string[]): number =>
    state.orders.filter((order) => statuses.includes(order.status)).length;

  stats.innerHTML = `
    <div class="stat-card"><strong>${count("New")}</strong><span>новых</span><i class="blue"></i></div>
    <div class="stat-card"><strong>${count("Accepted", "Cooking")}</strong><span>в работе</span><i class="orange"></i></div>
    <div class="stat-card"><strong>${count("Ready")}</strong><span>готовы к выдаче</span><i class="green"></i></div>
    <div class="stat-card"><strong>${count("Completed")}</strong><span>выполнено</span><i class="gray"></i></div>`;
}

function renderStopList(): void {
  const container = document.getElementById("stoplist");
  if (!container) return;

  if (state.menu.length === 0) {
    container.innerHTML = `<div class="column-empty">Меню пусто</div>`;
    return;
  }

  container.innerHTML = state.menu
    .map((item) => {
      const busy = state.busyMenu.has(item.id);
      return `
        <article class="stop-item ${item.isInStopList ? "stopped" : ""}">
          <div class="dish-emoji">${EMOJI[item.category] ?? "🍽"}</div>
          <div class="stop-info">
            <strong>${esc(item.name)}</strong>
            <span>${esc(item.category)} · ${money(item.price)}</span>
          </div>
          <button
            class="stop-btn ${item.isInStopList ? "restore" : ""}"
            data-action="stop"
            data-id="${item.id}"
            data-flag="${String(!item.isInStopList)}"
            ${busy ? "disabled" : ""}
          >${busy ? "…" : item.isInStopList ? "Вернуть в меню" : "В стоп-лист"}</button>
        </article>`;
    })
    .join("");
}

function applySearch(): void {
  const query = state.search;
  document.querySelectorAll<HTMLElement>(".order-card").forEach((card) => {
    const haystack = card.dataset.search ?? "";
    card.classList.toggle("hidden", Boolean(query) && !haystack.includes(query));
  });
}

function updateBadge(): void {
  const badge = document.getElementById("nav-badge");
  if (!badge) return;
  const fresh = state.orders.filter((order) => order.status === "New").length;
  badge.textContent = String(fresh);
  badge.classList.toggle("hidden", fresh === 0);
}

/* ------------------------------------------------------------------ */
/*  Действия оператора                                                 */
/* ------------------------------------------------------------------ */

async function setStatus(id: number, status: string): Promise<void> {
  if (state.busyOrders.has(id)) return;
  state.busyOrders.add(id);
  renderBoard();

  try {
    const updated = await request<Order>(`/orders/${id}/status`, {
      method: "PATCH",
      body: { status },
    });
    upsertOrder(updated);
    renderBoard();
    renderStats();
    updateBadge();
    toast(`Заказ ${updated.number}: ${STATUS_LABELS[status] ?? status}`);
  } catch (error) {
    toast(
      error instanceof Error ? error.message : "Не удалось изменить статус",
      true,
    );
  } finally {
    state.busyOrders.delete(id);
    renderBoard();
  }
}

async function setStopList(id: number, inStopList: boolean): Promise<void> {
  if (state.busyMenu.has(id)) return;
  state.busyMenu.add(id);
  renderStopList();

  try {
    const updated = await request<MenuItem>(`/menu-items/${id}/stoplist`, {
      method: "PATCH",
      body: { inStopList },
    });
    state.menu = state.menu.map((item) =>
      item.id === updated.id ? updated : item,
    );
    toast(`${updated.name}: ${inStopList ? "в стоп-листе" : "снова в меню"}`);
  } catch (error) {
    toast(
      error instanceof Error ? error.message : "Не удалось изменить стоп-лист",
      true,
    );
  } finally {
    state.busyMenu.delete(id);
    renderStopList();
  }
}

function logout(message?: string): void {
  state.token = "";
  state.refreshToken = "";
  state.user = null;
  state.orders = [];
  state.menu = [];
  state.busyOrders.clear();
  state.busyMenu.clear();
  persist();
  stopRealtime();
  if (clockTimer) {
    window.clearInterval(clockTimer);
    clockTimer = undefined;
  }
  renderLogin(message ?? "");
}

/* ------------------------------------------------------------------ */
/*  Real-time (SignalR)                                                */
/* ------------------------------------------------------------------ */

async function connectRealtime(): Promise<void> {
  if (connection || !state.token) return;
  stopped = false;

  const conn = new HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => state.token })
    .withAutomaticReconnect([0, 2000, 5000, 10000])
    .build();

  connection = conn;

  conn.on("OrderCreated", (order: Order) => {
    upsertOrder(order);
    renderBoard();
    renderStats();
    updateBadge();
    beep();
  });

  conn.on("OrderStatusChanged", (order: Order) => {
    upsertOrder(order);
    renderBoard();
    renderStats();
    updateBadge();
  });

  conn.on("StopListChanged", () => {
    void loadMenu().catch(() => undefined);
  });

  conn.onreconnecting(() => setLive(false));

  conn.onreconnected(async () => {
    setLive(true);
    try {
      await conn.invoke("JoinOperators");
      await loadOrders();
    } catch {
      /* повторим при следующем событии */
    }
  });

  conn.onclose(() => {
    setLive(false);
    connection = null;
    scheduleReconnect();
  });

  try {
    await conn.start();
    if (stopped) {
      await conn.stop();
      return;
    }
    setLive(true);
    await conn.invoke("JoinOperators");
  } catch {
    setLive(false);
    connection = null;
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (stopped || !state.token || reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    void connectRealtime();
  }, 5000);
}

function stopRealtime(): void {
  stopped = true;
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  const conn = connection;
  connection = null;
  if (conn) void conn.stop().catch(() => undefined);
}

function setLive(online: boolean): void {
  const element = document.getElementById("live");
  if (!element) return;
  element.classList.toggle("online", online);
  element.classList.toggle("offline", !online);
  const label = element.querySelector("span");
  if (label) label.textContent = online ? "Онлайн" : "Офлайн";
}

/* ------------------------------------------------------------------ */
/*  Часы, справка, горячие клавиши                                     */
/* ------------------------------------------------------------------ */

function startClock(): void {
  const tick = (): void => {
    const element = document.getElementById("clock");
    if (element) {
      element.textContent = new Date().toLocaleTimeString("ru-RU", {
        hour12: false,
      });
    }
  };
  tick();
  if (clockTimer) window.clearInterval(clockTimer);
  clockTimer = window.setInterval(tick, 1000);
}

function toggleHelp(show?: boolean): void {
  const overlay = document.getElementById("help");
  if (!overlay) return;
  const next = show ?? overlay.classList.contains("hidden");
  overlay.classList.toggle("hidden", !next);
}

/* ------------------------------------------------------------------ */
/*  Глобальные обработчики                                             */
/* ------------------------------------------------------------------ */

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;

  const windowButton = target.closest<HTMLElement>("[data-win]");
  if (windowButton) {
    const action = windowButton.dataset.win;
    if (action === "min") window.desktop?.minimize();
    else if (action === "max") window.desktop?.maximize();
    else if (action === "close") window.desktop?.close();
    return;
  }

  const viewButton = target.closest<HTMLElement>("[data-view]");
  if (viewButton) {
    switchView(viewButton.dataset.view === "stoplist" ? "stoplist" : "orders");
    return;
  }

  if (target.closest("#logout")) {
    logout();
    return;
  }

  if (target.closest("#refresh")) {
    void refreshAll();
    return;
  }

  if (target.closest("#help-close")) {
    toggleHelp(false);
    return;
  }

  if (target.id === "help") {
    toggleHelp(false);
    return;
  }

  const action = target.closest<HTMLElement>("[data-action]");
  if (!action) return;

  const id = Number(action.dataset.id);
  if (!Number.isFinite(id)) return;

  if (action.dataset.action === "advance") {
    void setStatus(id, action.dataset.next ?? "");
  } else if (action.dataset.action === "cancel") {
    if (window.confirm("Отменить заказ?")) void setStatus(id, "Cancelled");
  } else if (action.dataset.action === "stop") {
    void setStopList(id, action.dataset.flag === "true");
  }
});

document.addEventListener("input", (event) => {
  const target = event.target as HTMLElement;
  if (target.id === "search") {
    state.search = (target as HTMLInputElement).value.trim().toLowerCase();
    applySearch();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "F1") {
    event.preventDefault();
    toggleHelp();
    return;
  }
  if (event.key === "F5") {
    event.preventDefault();
    void refreshAll();
    return;
  }
  if (event.key === "Escape") {
    toggleHelp(false);
  }
});

/* ------------------------------------------------------------------ */
/*  Старт                                                              */
/* ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  if (!state.token) {
    renderLogin();
    return;
  }

  try {
    const me = await request<User>("/users/me");
    if (me.role === "Customer") throw new Error("Недостаточно прав");
    state.user = me;
    persist();
    startApp();
  } catch (error) {
    state.token = "";
    state.refreshToken = "";
    state.user = null;
    persist();
    renderLogin(
      error instanceof Error && error.message === "Недостаточно прав"
        ? "Для рабочего места нужен аккаунт оператора"
        : "Сессия истекла — войдите снова",
    );
  }
}

void boot();
