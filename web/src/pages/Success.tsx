import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, money, STATUS_COLORS, STATUS_LABELS } from "../api";
import type { Order } from "../api";

const FLOW = ["Accepted", "Cooking", "Ready", "Completed"];

export function SuccessPage() {
  const { id } = useParams();
  const location = useLocation();
  const justPaid = Boolean((location.state as { justPaid?: boolean } | null)?.justPaid);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const orderId = Number(id);
    if (!Number.isFinite(orderId)) {
      setError("Некорректный номер заказа");
      return;
    }

    let active = true;
    const load = () =>
      api
        .order(orderId)
        .then((fresh) => {
          if (active) setOrder(fresh);
        })
        .catch((err: Error) => {
          if (active) setError(err.message);
        });

    load();
    const timer = window.setInterval(load, 12000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);

  if (error) {
    return (
      <div className="empty page">
        <div className="empty-icon">⚠️</div>
        <h2>Заказ не найден</h2>
        <p className="muted">{error}</p>
        <Link className="primary" to="/">
          В меню
        </Link>
      </div>
    );
  }

  if (!order) {
    return <div className="page-loader">Загружаем заказ…</div>;
  }

  const current = FLOW.indexOf(order.status);

  return (
    <div className="page narrow">
      <section className="success-hero">
        <div className="success-check">{justPaid ? "✓" : "📦"}</div>
        <h1>{justPaid ? "Заказ оформлен" : "Детали заказа"}</h1>
        <p className="muted">
          Номер <strong>{order.number}</strong> · {money(order.totalAmount)}
        </p>
        <span
          className="status-chip"
          style={{ background: `${STATUS_COLORS[order.status]}1a`, color: STATUS_COLORS[order.status] }}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </section>

      <section className="panel">
        <h2>Статус заказа</h2>
        <ol className="timeline">
          {FLOW.map((step, index) => (
            <li
              key={step}
              className={
                index < current ? "done" : index === current ? "current" : ""
              }
            >
              <span className="dot" />
              <span>{STATUS_LABELS[step]}</span>
            </li>
          ))}
        </ol>
        <p className="muted small">
          Страница обновляется автоматически. Как только статус изменится, вы
          увидите это здесь.
        </p>
      </section>

      <section className="panel">
        <h2>Состав заказа</h2>
        <ul className="order-lines">
          {order.items.map((line) => (
            <li key={line.menuItemId}>
              <span>
                {line.name} <span className="muted">× {line.quantity}</span>
              </span>
              <span>{money(line.price * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="summary-row total">
          <span>Оплачено</span>
          <span>{money(order.totalAmount)}</span>
        </div>
        <div className="bonus-note">
          🎁 Начислено бонусов: <strong>{order.bonusAccrued}</strong>
        </div>
      </section>

      <div className="row gap">
        <Link className="primary" to="/orders">
          Мои заказы
        </Link>
        <Link className="secondary" to="/">
          Вернуться в меню
        </Link>
      </div>
    </div>
  );
}
