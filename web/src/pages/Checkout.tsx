import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";

export function CheckoutPage() {
  const { user } = useAuth();
  const { lines, total, clear } = useCart();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [method, setMethod] = useState<"Card" | "SBP">("Card");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (lines.length === 0) {
    return (
      <div className="empty page">
        <div className="empty-icon">🧾</div>
        <h2>Нечего оформлять</h2>
        <p className="muted">Сначала добавьте блюда в корзину.</p>
        <Link className="primary" to="/">
          В меню
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (address.trim().length < 5) {
      setError("Укажите адрес доставки");
      return;
    }
    if (!/^\+7\d{10}$/.test(phone.replace(/[\s()-]/g, ""))) {
      setError("Телефон в формате +7XXXXXXXXXX");
      return;
    }

    setBusy(true);
    try {
      const order = await api.createOrder(
        lines.map((line) => ({ menuItemId: line.item.id, quantity: line.qty })),
        comment.trim() || undefined,
      );
      await api.pay(order.id, method);
      clear();
      navigate(`/success/${order.id}`, { replace: true, state: { justPaid: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось оформить заказ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Оформление заказа</h1>
        <Link to="/cart" className="link">
          Вернуться в корзину
        </Link>
      </div>

      <form onSubmit={submit} className="checkout">
        <div className="checkout-main">
          <section className="panel">
            <h2>Получатель</h2>
            <div className="form-grid">
              <label className="field">
                <span>Имя</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Телефон</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Адрес доставки</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ул. Ленина, 10, кв. 5"
                required
              />
            </label>
            <label className="field">
              <span>Комментарий к заказу</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Домофон, пожелания по составу…"
              />
            </label>
          </section>

          <section className="panel">
            <h2>Оплата</h2>
            <div className="pay-methods">
              <label className={method === "Card" ? "pay-method active" : "pay-method"}>
                <input
                  type="radio"
                  name="method"
                  checked={method === "Card"}
                  onChange={() => setMethod("Card")}
                />
                <span className="pay-icon">💳</span>
                <span>
                  <strong>Банковская карта</strong>
                  <small className="muted">Visa, Mastercard, МИР</small>
                </span>
              </label>
              <label className={method === "SBP" ? "pay-method active" : "pay-method"}>
                <input
                  type="radio"
                  name="method"
                  checked={method === "SBP"}
                  onChange={() => setMethod("SBP")}
                />
                <span className="pay-icon">📱</span>
                <span>
                  <strong>СБП</strong>
                  <small className="muted">Оплата по QR-коду</small>
                </span>
              </label>
            </div>
            <p className="muted small">
              После оплаты начислим 5% бонусами на счёт.
            </p>
          </section>
        </div>

        <aside className="checkout-side">
          <div className="panel">
            <h2>Ваш заказ</h2>
            <ul className="order-lines">
              {lines.map(({ item, qty }) => (
                <li key={item.id}>
                  <span>
                    {item.name} <span className="muted">× {qty}</span>
                  </span>
                  <span>{money(item.price * qty)}</span>
                </li>
              ))}
            </ul>
            <div className="summary-row total">
              <span>Итого</span>
              <span>{money(total)}</span>
            </div>
            {error && <div className="alert error">{error}</div>}
            <button type="submit" className="primary wide" disabled={busy}>
              {busy ? "Оформляем…" : `Оплатить ${money(total)}`}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
