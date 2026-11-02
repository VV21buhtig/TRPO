import { Link } from "react-router-dom";
import { money } from "../api";
import { useCart } from "../state/cart";

export function CartPage() {
  const { lines, setQty, remove, total, clear } = useCart();

  if (lines.length === 0) {
    return (
      <div className="empty page">
        <div className="empty-icon">🛒</div>
        <h2>Корзина пуста</h2>
        <p className="muted">Добавьте блюда из меню, чтобы оформить заказ.</p>
        <Link className="primary" to="/">
          Перейти в меню
        </Link>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Корзина</h1>
        <button type="button" className="link-danger" onClick={clear}>
          Очистить
        </button>
      </div>

      <div className="cart-list">
        {lines.map(({ item, qty }) => (
          <div className="cart-line" key={item.id}>
            <div className="cart-art" aria-hidden>
              🍔
            </div>
            <div className="cart-info">
              <strong>{item.name}</strong>
              <span className="muted small">{money(item.price)}</span>
            </div>
            <div className="stepper">
              <button type="button" onClick={() => setQty(item.id, qty - 1)} aria-label="Меньше">
                −
              </button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty(item.id, qty + 1)} aria-label="Больше">
                +
              </button>
            </div>
            <div className="cart-sum">{money(item.price * qty)}</div>
            <button
              type="button"
              className="icon-button"
              onClick={() => remove(item.id)}
              aria-label="Удалить"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="summary">
        <div className="summary-row">
          <span>Товары</span>
          <span>{money(total)}</span>
        </div>
        <div className="summary-row">
          <span>Доставка</span>
          <span className="success">Бесплатно</span>
        </div>
        <div className="summary-row total">
          <span>Итого</span>
          <span>{money(total)}</span>
        </div>
        <Link className="primary wide" to="/checkout">
          Перейти к оформлению
        </Link>
      </div>
    </div>
  );
}
