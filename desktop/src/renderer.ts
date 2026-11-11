import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

/* ------------------------------------------------------------------ */
/*  Типы, совпадающие с контрактами REST API                           */
/* ------------------------------------------------------------------ */

type Role = "Customer" | "Operator" | "Administrator";

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
  basePrice?: number;
  discountPercent?: number;
  promotionTitle?: string | null;
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

type StatusHistoryEvent = {
  status: string;
  changedAt: string;
  changedBy: { id: number | null; name: string; role: string };
  comment: string | null;
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
  statusHistory: StatusHistoryEvent[];
  payment: { method: string; status: string } | null;
};

type SalesReport = {
  from: string;
  to: string;
  ordersCount: number;
  paidCount: number;
  completedCount: number;
  cancelledCount: number;
  cancelledAmount: number;
  revenue: number;
  averageCheck: number;
  statusCounts: Record<string, number>;
  operatorStats: Array<{
    id: number | null;
    name: string;
    role: string;
    actions: number;
    lastAt: string;
  }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
};

type Promotion = {
  id: number;
  title: string;
  discountPercent: number;
  isActive: boolean;
  scope: "None" | "All" | "Category" | "MenuItem";
  category: string | null;
  menuItemId: number | null;
};

type Staff = {
  id: number;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  createdAt: string;
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
      apiUrl: string | null;
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
  window.desktop?.apiUrl ??
  localStorage.getItem("ff_desktop_api") ??
  "http://127.0.0.1:5080/api/v1"
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
  view: "orders" as "orders" | "stoplist" | "admin",
  search: "",
  busyOrders: new Set<number>(),
  busyMenu: new Set<number>(),
  report: null as SalesReport | null,
  promotions: [] as Promotion[],
  staff: [] as Staff[],
  editingPromotionId: null as number | null,
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
  const staff = state.user?.role === "Administrator" ? "менеджер" : "оператор";
  return `
    <div class="titlebar">
      <div class="brand">
        <span class="brand-mark">О</span>
        <span class="brand-text">Онлайн-заказ</span>
        <span class="brand-sub">${staff}</span>
      </div>
      <div class="titlebar-caption">Рабочее место: ${staff}</div>
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
  const role = user?.role === "Administrator" ? "Менеджер" : "Оператор";
  const isAdmin = user?.role === "Administrator";

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
          ${
            isAdmin
              ? `<button class="nav-item" data-view="admin">
                  <span>📊</span> Управление
                </button>`
              : ""
          }
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
        <section class="admin hidden" id="admin"></section>
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

function switchView(view: "orders" | "stoplist" | "admin"): void {
  state.view = view;

  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  document.getElementById("board")?.classList.toggle("hidden", view !== "orders");
  document.getElementById("stats")?.classList.toggle("hidden", view !== "orders");
  document.getElementById("stoplist")?.classList.toggle("hidden", view !== "stoplist");
  document.getElementById("admin")?.classList.toggle("hidden", view !== "admin");
  document.getElementById("search-box")?.classList.toggle("hidden", view !== "orders");

  const titles: Record<typeof view, [string, string]> = {
    orders: ["Заказы", "Все заказы в реальном времени"],
    stoplist: ["Стоп-лист", "Управление доступностью блюд"],
    admin: ["Управление", "Отчёты, сотрудники и журнал действий"],
  };
  const title = document.getElementById("page-title");
  const subtitle = document.getElementById("page-subtitle");
  if (title) title.textContent = titles[view][0];
  if (subtitle) subtitle.textContent = titles[view][1];

  if (view === "admin") {
    void loadAdmin();
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
  if (state.view === "admin") renderAdmin();
}

async function loadMenu(): Promise<void> {
  state.menu = await request<MenuItem[]>("/menu-items?includeStopList=true");
  renderStopList();
}

async function loadAdmin(): Promise<void> {
  if (state.user?.role !== "Administrator") return;
  try {
    // Цены в форме акции и стоп-листе зависят от активных акций,
    // поэтому обновляем меню при каждом открытии/обновлении «Управления».
    await loadMenu();
    const [report, promotions, staff] = await Promise.all([
      request<SalesReport>("/admin/reports/sales"),
      request<Promotion[]>("/admin/promotions"),
      request<Staff[]>("/admin/staff"),
    ]);
    state.report = report;
    state.promotions = promotions;
    state.staff = staff;
    renderAdmin();
  } catch (error) {
    const message = document.getElementById("admin");
    if (message) {
      message.innerHTML = `<div class="column-empty">Не удалось загрузить отчёт: ${esc(
        error instanceof Error ? error.message : "ошибка",
      )}</div>`;
    }
  }
}

function roleLabel(role: string): string {
  if (role === "Administrator") return "Менеджер";
  if (role === "Operator") return "Оператор";
  if (role === "Customer") return "Клиент";
  return role;
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function promotionTarget(promo: Promotion): string {
  if (promo.scope === "All") return "все блюда";
  if (promo.scope === "Category") return `категория «${promo.category ?? "—"}»`;
  if (promo.scope === "MenuItem") {
    const item = state.menu.find((menuItem) => menuItem.id === promo.menuItemId);
    return item ? `блюдо «${item.name}»` : `блюдо #${promo.menuItemId ?? "—"}`;
  }
  return "без привязки";
}

function renderAdmin(): void {
  const container = document.getElementById("admin");
  if (!container) return;
  const report = state.report;
  if (!report) {
    container.innerHTML = `<div class="column-empty">Загрузка отчёта…</div>`;
    return;
  }

  const audit = state.orders
    .flatMap((order) =>
      order.statusHistory.map((event) => ({ ...event, orderNumber: order.number })),
    )
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, 30);

  const topItems = report.topItems.length
    ? report.topItems
        .map(
          (item) => `<tr>
            <td>${esc(item.name)}</td>
            <td>${item.quantity}</td>
            <td>${money(item.revenue)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">Пока нет продаж</td></tr>`;

  const operators = report.operatorStats.length
    ? report.operatorStats
        .map(
          (item) => `<tr>
            <td class="actor-id">${item.id ? `#${item.id}` : "—"}</td>
            <td><strong>${esc(item.name)}</strong><span class="role-note">${roleLabel(item.role)}</span></td>
            <td>${item.actions}</td>
            <td>${dateTime(item.lastAt)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted">Действий сотрудников пока нет</td></tr>`;

  const events = audit.length
    ? audit
        .map(
          (event) => `<tr>
            <td><strong>${esc(event.orderNumber)}</strong></td>
            <td><span class="status ${esc(event.status)}">${esc(STATUS_LABELS[event.status] ?? event.status)}</span></td>
            <td>
              ${event.changedBy.id ? `<span class="actor-id">#${event.changedBy.id}</span> ` : ""}
              ${esc(event.changedBy.name)}
              <span class="role-note">${roleLabel(event.changedBy.role)}</span>
            </td>
            <td>${dateTime(event.changedAt)}</td>
            <td>${esc(event.comment ?? "—")}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="muted">Журнал пока пуст</td></tr>`;

  const promoRows = state.promotions.length
    ? state.promotions
        .map(
          (promo) => `<li class="promo-row ${promo.isActive ? "" : "promo-off"}">
            <div class="promo-title">
              <span>${esc(promo.title)}</span>
              <small>−${promo.discountPercent}% · ${esc(promotionTarget(promo))} · ${promo.isActive ? "активна" : "выключена"}</small>
            </div>
            <div class="promo-actions">
              <button type="button" class="btn mini ghost" data-action="promo-edit" data-id="${promo.id}">Изменить</button>
              <button type="button" class="btn mini ${promo.isActive ? "ghost-danger" : "ghost"}" data-action="promo-toggle" data-id="${promo.id}" data-active="${!promo.isActive}">${promo.isActive ? "Выключить" : "Включить"}</button>
            </div>
          </li>`,
        )
        .join("")
    : `<li class="muted">Акций пока нет</li>`;

  const staffRows = state.staff.length
    ? state.staff
        .map(
          (person) => `<tr class="${person.isActive ? "" : "staff-off"}">
            <td class="actor-id">#${person.id}</td>
            <td><strong>${esc(person.name)}</strong><span class="role-note">${roleLabel(person.role)}</span></td>
            <td>${esc(person.phone)}</td>
            <td><span class="staff-state ${person.isActive ? "on" : "off"}">${person.isActive ? "Активен" : "Заблокирован"}</span></td>
            <td>
              <button type="button" class="btn mini ${person.isActive ? "ghost-danger" : "ghost"}" data-action="staff-toggle" data-id="${person.id}" data-active="${!person.isActive}">
                ${person.isActive ? "Заблокировать" : "Разблокировать"}
              </button>
            </td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" class="muted">Сотрудников пока нет</td></tr>`;

  const editingPromo = state.promotions.find((promo) => promo.id === state.editingPromotionId);
  const categories = [...new Set(state.menu.map((item) => item.category))].sort();
  const promoScope = editingPromo?.scope ?? "None";
  const promoCategory = editingPromo?.category ?? categories[0] ?? "";
  const promoMenuItem = editingPromo?.menuItemId ?? state.menu[0]?.id ?? "";

  container.innerHTML = `
    <div class="admin-kpis">
      <div class="admin-kpi"><span>Выручка</span><strong>${money(report.revenue)}</strong><small>${report.paidCount} оплаченных</small></div>
      <div class="admin-kpi"><span>Средний чек</span><strong>${money(report.averageCheck)}</strong><small>за ${report.ordersCount} заказов</small></div>
      <div class="admin-kpi"><span>Выполнено</span><strong>${report.completedCount}</strong><small>за период</small></div>
      <div class="admin-kpi danger"><span>Отменено</span><strong>${report.cancelledCount}</strong><small>${money(report.cancelledAmount)}</small></div>
    </div>

    <div class="admin-grid">
      <section class="admin-card">
        <div class="admin-card-head"><h2>Топ блюд</h2><span>за 30 дней</span></div>
        <table class="admin-table">
          <thead><tr><th>Блюдо</th><th>Штук</th><th>Сумма</th></tr></thead>
          <tbody>${topItems}</tbody>
        </table>
      </section>

      <section class="admin-card">
        <div class="admin-card-head"><h2>Активность сотрудников</h2><span>кто и сколько действий сделал</span></div>
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Сотрудник</th><th>Действий</th><th>Последнее</th></tr></thead>
          <tbody>${operators}</tbody>
        </table>
      </section>

      <section class="admin-card admin-card-wide">
        <div class="admin-card-head"><h2>Журнал действий</h2><span>кто принял, выдал и отменил</span></div>
        <div class="audit-scroll">
          <table class="admin-table audit-table">
            <thead><tr><th>Заказ</th><th>Статус</th><th>Автор</th><th>Когда</th><th>Комментарий</th></tr></thead>
            <tbody>${events}</tbody>
          </table>
        </div>
      </section>

      <section class="admin-card admin-card-wide">
        <div class="admin-card-head"><h2>Сотрудники</h2><span>ID, ФИО и доступ к системе</span></div>
        <div class="staff-layout">
          <table class="admin-table staff-table">
            <thead><tr><th>ID</th><th>ФИО</th><th>Телефон</th><th>Доступ</th><th></th></tr></thead>
            <tbody>${staffRows}</tbody>
          </table>
          <form class="staff-form" id="staff-form">
            <h3>Добавить сотрудника</h3>
            <input id="staff-name" placeholder="ФИО" maxlength="80" />
            <input id="staff-phone" placeholder="+7 999 000-00-00" autocomplete="off" />
            <input id="staff-password" type="password" value="12345" placeholder="Пароль" autocomplete="new-password" />
            <select id="staff-role">
              <option value="Operator">Оператор</option>
              <option value="Administrator">Менеджер</option>
            </select>
            <button type="button" class="btn primary" data-action="staff-create">Создать доступ</button>
            <small>Физическое удаление не выполняется. Заблокированного сотрудника можно вернуть кнопкой «Разблокировать» — доступ восстановится сразу.</small>
          </form>
        </div>
      </section>

      <section class="admin-card admin-card-wide">
        <div class="admin-card-head"><h2>Акции</h2><span>${state.promotions.length} в справочнике</span></div>
        <div class="promo-layout">
          <ul class="promo-list">${promoRows}</ul>
          <form class="promo-form" id="promo-form">
            <h3>${editingPromo ? `Акция #${editingPromo.id}` : "Новая акция"}</h3>
            <input id="promo-title" placeholder="Название акции" maxlength="80" value="${esc(editingPromo?.title ?? "")}" />
            <div class="form-inline">
              <input id="promo-percent" type="number" min="1" max="90" placeholder="Скидка, %" value="${editingPromo?.discountPercent ?? ""}" />
              <button type="button" class="btn primary" data-action="promo-save">${editingPromo ? "Сохранить" : "Добавить"}</button>
              ${editingPromo ? `<button type="button" class="btn ghost" data-action="promo-cancel">Отмена</button>` : ""}
            </div>
            <label class="form-field">К чему применить
              <select id="promo-scope">
                <option value="None" ${promoScope === "None" ? "selected" : ""}>Без привязки (информационная)</option>
                <option value="All" ${promoScope === "All" ? "selected" : ""}>Все блюда</option>
                <option value="Category" ${promoScope === "Category" ? "selected" : ""}>Категория</option>
                <option value="MenuItem" ${promoScope === "MenuItem" ? "selected" : ""}>Одно блюдо</option>
              </select>
            </label>
            <label class="form-field ${promoScope === "Category" ? "" : "hidden"}" id="promo-category-wrap">Категория
              <select id="promo-category">
                ${categories.map((category) => `<option value="${esc(category)}" ${category === promoCategory ? "selected" : ""}>${esc(category)}</option>`).join("")}
              </select>
            </label>
            <label class="form-field ${promoScope === "MenuItem" ? "" : "hidden"}" id="promo-item-wrap">Блюдо
              <select id="promo-item">
                ${state.menu.map((item) => `<option value="${item.id}" ${item.id === promoMenuItem ? "selected" : ""}>${esc(item.name)} — ${money(item.price)}</option>`).join("")}
              </select>
            </label>
            <small>Без привязки акция остаётся справочной и не меняет цены.</small>
          </form>
        </div>
      </section>
    </div>`;

  const scopeSelect = document.getElementById("promo-scope") as HTMLSelectElement | null;
  const categoryWrap = document.getElementById("promo-category-wrap");
  const itemWrap = document.getElementById("promo-item-wrap");
  const syncScopeFields = (): void => {
    categoryWrap?.classList.toggle("hidden", scopeSelect?.value !== "Category");
    itemWrap?.classList.toggle("hidden", scopeSelect?.value !== "MenuItem");
  };
  scopeSelect?.addEventListener("change", syncScopeFields);
  syncScopeFields();
}

async function savePromotion(): Promise<void> {
  const title = document.querySelector<HTMLInputElement>("#promo-title")?.value.trim() ?? "";
  const discount = Number(document.querySelector<HTMLInputElement>("#promo-percent")?.value ?? 0);
  const scope = document.querySelector<HTMLSelectElement>("#promo-scope")?.value ?? "None";
  const category = document.querySelector<HTMLSelectElement>("#promo-category")?.value ?? null;
  const menuItemId = Number(document.querySelector<HTMLSelectElement>("#promo-item")?.value ?? 0);
  if (!title || !Number.isFinite(discount) || discount < 1 || discount > 90) {
    toast("Укажите название и скидку 1–90%", true);
    return;
  }
  const body = {
    title,
    discountPercent: discount,
    scope,
    category: scope === "Category" ? category : null,
    menuItemId: scope === "MenuItem" && menuItemId > 0 ? menuItemId : null,
  };
  try {
    if (state.editingPromotionId) {
      await request<Promotion>(`/admin/promotions/${state.editingPromotionId}`, {
        method: "PATCH",
        body,
      });
      toast("Акция обновлена");
    } else {
      await request<Promotion>("/admin/promotions", {
        method: "POST",
        body,
      });
      toast("Акция добавлена");
    }
    state.editingPromotionId = null;
    await loadAdmin();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Не удалось сохранить акцию", true);
  }
}

async function togglePromotion(id: number, active: boolean): Promise<void> {
  try {
    await request<Promotion>(`/admin/promotions/${id}`, {
      method: "PATCH",
      body: { isActive: active },
    });
    await loadAdmin();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Не удалось изменить акцию", true);
  }
}

async function createStaff(): Promise<void> {
  const name = document.querySelector<HTMLInputElement>("#staff-name")?.value.trim() ?? "";
  const phone = document.querySelector<HTMLInputElement>("#staff-phone")?.value.trim() ?? "";
  const password = document.querySelector<HTMLInputElement>("#staff-password")?.value ?? "";
  const role = document.querySelector<HTMLSelectElement>("#staff-role")?.value ?? "Operator";
  if (!name || !phone || password.length < 5) {
    toast("Укажите ФИО, телефон и пароль не короче 5 символов", true);
    return;
  }
  try {
    await request<Staff>("/admin/staff", {
      method: "POST",
      body: { name, phone, password, role },
    });
    toast("Сотрудник добавлен");
    await loadAdmin();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Не удалось добавить сотрудника", true);
  }
}

async function toggleStaff(id: number, active: boolean): Promise<void> {
  try {
    await request<Staff>(`/admin/staff/${id}/active`, {
      method: "PATCH",
      body: { isActive: active },
    });
    toast(active ? "Доступ восстановлен" : "Доступ заблокирован");
    await loadAdmin();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Не удалось изменить доступ", true);
  }
}

async function refreshAll(): Promise<void> {
  if (!state.user) return;
  try {
    await Promise.all([loadOrders(), loadMenu()]);
    if (state.view === "admin") await loadAdmin();
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
  const history = order.statusHistory ?? [];
  const creator = history.find((event) => event.status === "New") ?? history[0];
  const lastEvent = history.at(-1);
  const actorName = (event: StatusHistoryEvent): string =>
    `${event.changedBy.id ? `#${event.changedBy.id} ` : ""}${event.changedBy.name}`;
  const lastActor = lastEvent && lastEvent.status !== "New"
    ? `${STATUS_LABELS[lastEvent.status] ?? lastEvent.status}: ${actorName(lastEvent)}`
    : "";

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
      ${creator || lastActor ? `<div class="order-audit">
        ${creator ? `<span>Оформил: ${esc(actorName(creator))}</span>` : ""}
        ${lastActor ? `<span>${esc(lastActor)}</span>` : ""}
        ${lastEvent?.comment ? `<span class="audit-comment">${esc(lastEvent.comment)}</span>` : ""}
      </div>` : ""}
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

async function setStatus(id: number, status: string, comment?: string): Promise<void> {
  if (state.busyOrders.has(id)) return;
  state.busyOrders.add(id);
  renderBoard();

  try {
    const updated = await request<Order>(`/orders/${id}/status`, {
      method: "PATCH",
      body: comment ? { status, comment } : { status },
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

function askCancelReason(orderNumber: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "cancel-dialog";
    overlay.innerHTML = `
      <div class="help-card confirm-card">
        <div class="help-head">
          <h2>Отменить заказ ${esc(orderNumber)}?</h2>
          <button class="icon-button" data-cancel-close title="Закрыть">✕</button>
        </div>
        <p>Заказ останется в истории. Отмена будет записана в журнал с вашим ID, ФИО и причиной.</p>
        <textarea id="cancel-reason" maxlength="200" placeholder="Причина отмены (необязательно)"></textarea>
        <div class="confirm-actions">
          <button type="button" class="btn ghost" data-cancel-close>Не отменять</button>
          <button type="button" class="btn danger" data-cancel-confirm>Отменить заказ</button>
        </div>
      </div>`;
    document.body.append(overlay);

    let finished = false;
    const close = (value: string | null): void => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close(null);
    };
    const reason = overlay.querySelector<HTMLTextAreaElement>("#cancel-reason");

    overlay.querySelectorAll<HTMLElement>("[data-cancel-close]").forEach((button) => {
      button.addEventListener("click", () => close(null));
    });
    overlay.querySelector<HTMLElement>("[data-cancel-confirm]")?.addEventListener("click", () => {
      close(reason?.value.trim() ?? "");
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKey);
    reason?.focus();
  });
}

async function cancelOrder(id: number): Promise<void> {
  const order = state.orders.find((item) => item.id === id);
  const reason = await askCancelReason(order?.number ?? `#${id}`);
  if (reason === null) return;
  await setStatus(id, "Cancelled", reason || undefined);
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
    const view = viewButton.dataset.view;
    switchView(view === "stoplist" || view === "admin" ? view : "orders");
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

  const adminAction = target.closest<HTMLElement>("[data-action]");
  const adminKind = adminAction?.dataset.action;
  if (adminKind === "promo-save") {
    void savePromotion();
    return;
  }
  if (adminKind === "staff-create") {
    void createStaff();
    return;
  }
  if (adminKind === "promo-cancel") {
    state.editingPromotionId = null;
    renderAdmin();
    return;
  }
  if (adminKind === "promo-edit" || adminKind === "promo-toggle" || adminKind === "staff-toggle") {
    const id = Number(adminAction?.dataset.id);
    if (!Number.isFinite(id)) return;
    if (adminKind === "promo-edit") {
      state.editingPromotionId = id;
      renderAdmin();
    } else if (adminKind === "promo-toggle") {
      void togglePromotion(id, adminAction?.dataset.active === "true");
    } else {
      void toggleStaff(id, adminAction?.dataset.active === "true");
    }
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
    void cancelOrder(id);
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
