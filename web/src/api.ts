export type MenuItem = {
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

export type OrderLine = {
  menuItemId: number;
  name: string;
  quantity: number;
  price: number;
};

export type Order = {
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

export type User = {
  id: number;
  name: string;
  phone: string;
  role: string;
  bonusBalance: number;
};

export type Tokens = { accessToken: string; refreshToken: string };

const RAW_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://127.0.0.1:5080/api/v1";

// Относительный /api/v1 используется при публикации web и API за одним
// HTTPS-туннелем: браузер обращается к тому же origin, а Vite proxy
// перенаправляет /api и /hubs на локальный Kestrel.
const BASE = RAW_BASE;

export const API_ORIGIN = RAW_BASE.startsWith("http")
  ? RAW_BASE.replace(/\/api\/v1$/, "")
  : window.location.origin;

const TOKENS_KEY = "ff_tokens";
const USER_KEY = "ff_user";

export function getTokens(): Tokens | null {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setTokens(tokens: Tokens | null) {
  if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKENS_KEY);
}

export function getStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

async function send(path: string, init: RequestInit, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(BASE + path, { ...init, headers });
}

type Options = { method?: string; body?: unknown; auth?: boolean };

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  let tokens = getTokens();

  const payload = body === undefined ? undefined : JSON.stringify(body);
  let res = await send(path, { method, body: payload }, auth ? tokens?.accessToken : undefined);

  if (res.status === 401 && auth && tokens?.refreshToken) {
    const refreshed = await send("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (refreshed.ok) {
      const next = (await refreshed.json()) as Tokens;
      setTokens(next);
      tokens = next;
      res = await send(path, { method, body: payload }, tokens.accessToken);
    } else {
      setTokens(null);
      setStoredUser(null);
    }
  }

  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const data = await res.json();
      message = data.error ?? data.title ?? message;
    } catch {
      /* тело не JSON */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (phone: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>(
      "/auth/login",
      { method: "POST", body: { phone, password }, auth: false },
    ),
  smsCode: (phone: string) =>
    request<{ sent: boolean; code: string }>("/auth/sms-code", {
      method: "POST",
      body: { phone },
      auth: false,
    }),
  loginSms: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string; user: User }>(
      "/auth/login-sms",
      { method: "POST", body: { phone, code }, auth: false },
    ),
  me: () => request<User>("/users/me"),
  updateProfile: (name: string) =>
    request<User>("/users/me", { method: "PATCH", body: { name } }),
  menu: (category?: string, includeStopList = false) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (includeStopList) params.set("includeStopList", "true");
    const qs = params.toString();
    return request<MenuItem[]>(`/menu-items${qs ? `?${qs}` : ""}`);
  },
  createOrder: (items: { menuItemId: number; quantity: number }[], comment?: string) =>
    request<Order>("/orders", { method: "POST", body: { items, comment } }),
  orders: () => request<Order[]>("/orders"),
  order: (id: number) => request<Order>(`/orders/${id}`),
  pay: (orderId: number, method: string) =>
    request<{ paymentId: number; status: string; bonusAccrued: number; order: Order }>(
      "/payments",
      { method: "POST", body: { orderId, method } },
    ),
  balance: () => request<{ balance: number }>("/loyalty/balance"),
};

export const STATUS_LABELS: Record<string, string> = {
  New: "Новый",
  Accepted: "Принят",
  Cooking: "Готовится",
  Ready: "Готов",
  Completed: "Выполнен",
  Cancelled: "Отменён",
};

export const STATUS_COLORS: Record<string, string> = {
  New: "#2F6FED",
  Accepted: "#F59E0B",
  Cooking: "#F26522",
  Ready: "#22A06B",
  Completed: "#6B7280",
  Cancelled: "#F04438",
};

export function money(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
