import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HubConnectionBuilder } from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import {
  api,
  API_ORIGIN,
  formatDate,
  getTokens,
  money,
  STATUS_COLORS,
  STATUS_LABELS,
} from "../api";
import type { Order } from "../api";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .orders()
      .then((list) => {
        if (active) setOrders(list);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let connection: HubConnection | null = null;
    let closed = false;

    async function joinAll(conn: HubConnection, list: Order[]) {
      for (const order of list) {
        try {
          await conn.invoke("JoinOrder", order.number);
        } catch {
          /* группа недоступна — не критично */
        }
      }
    }

    async function connect() {
      const token = getTokens()?.accessToken;
      if (!token) return;

      connection = new HubConnectionBuilder()
        .withUrl(`${API_ORIGIN}/hubs/orders`, {
          accessTokenFactory: () => getTokens()?.accessToken ?? "",
        })
        .withAutomaticReconnect()
        .build();

      connection.on("OrderStatusChanged", (updated: Order) => {
        setOrders((prev) =>
          prev.some((order) => order.id === updated.id)
            ? prev.map((order) => (order.id === updated.id ? updated : order))
            : [updated, ...prev],
        );
      });

      connection.onclose(() => {
        if (!closed) setLive(false);
      });
      connection.onreconnected(async () => {
        setLive(true);
        const list = await api.orders().catch(() => [] as Order[]);
        setOrders(list);
        if (connection) await joinAll(connection, list);
      });

      try {
        await connection.start();
        if (closed) {
          await connection.stop();
          return;
        }
        setLive(true);
        const list = await api.orders().catch(() => [] as Order[]);
        setOrders(list);
        await joinAll(connection, list);
      } catch {
        setLive(false);
      }
    }

    // небольшая задержка гасит двойной mount в React StrictMode (dev)
    const timer = window.setTimeout(() => void connect(), 80);

    return () => {
      closed = true;
      window.clearTimeout(timer);
      void connection?.stop();
    };
  }, []);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Мои заказы</h1>
        <span className={live ? "live on" : "live"}>
          <span className="pulse" />
          {live ? "Обновляется онлайн" : "Офлайн-режим"}
        </span>
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div className="page-loader">Загружаем заказы…</div>
      ) : orders.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🧾</div>
          <h3>Заказов пока нет</h3>
          <p className="muted">Самое время что-нибудь заказать.</p>
          <Link className="primary" to="/">
            Перейти в меню
          </Link>
        </div>
      ) : (
        <div className="orders">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-head">
                <div>
                  <strong>{order.number}</strong>
                  <span className="muted small"> · {formatDate(order.createdAt)}</span>
                </div>
                <span
                  className="status-chip"
                  style={{
                    background: `${STATUS_COLORS[order.status]}1a`,
                    color: STATUS_COLORS[order.status],
                  }}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
              <ul className="order-lines compact">
                {order.items.map((line) => (
                  <li key={line.menuItemId}>
                    <span>
                      {line.name} <span className="muted">× {line.quantity}</span>
                    </span>
                    <span>{money(line.price * line.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="order-foot">
                <span className="price">{money(order.totalAmount)}</span>
                <Link className="secondary small" to={`/success/${order.id}`}>
                  Подробнее
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
