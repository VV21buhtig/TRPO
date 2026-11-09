import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money } from "../api";
import type { MenuItem } from "../api";
import { useCart } from "../state/cart";

const EMOJI: Record<string, string> = {
  Бургеры: "🍔",
  Закуски: "🍟",
  Напитки: "🥤",
  Десерты: "🍩",
  Соусы: "🥫",
};

function emojiFor(category: string): string {
  return EMOJI[category] ?? "🍽";
}

export function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("Все");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const { add, count, total } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .menu()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(
    () => ["Все", ...Array.from(new Set(items.map((item) => item.category)))],
    [items],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        (category === "Все" || item.category === category) &&
        (!query ||
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)),
    );
  }, [items, category, search]);

  return (
    <div className="menu-page">
      <section className="hero">
        <div className="hero-text">
          <span className="hero-tag">Доставка 25–40 минут</span>
          <h1>
            Вкусно, быстро,
            <br />
            без очереди
          </h1>
          <p>
            Соберите заказ в приложении — приготовим к вашему приходу или
            привезём домой.
          </p>
        </div>
        <div className="hero-art" aria-hidden>
          🍔
        </div>
      </section>

      <div className="toolbar">
        <div className="chips">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={name === category ? "chip active" : "chip"}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Найти блюдо"
          aria-label="Поиск по меню"
        />
      </div>

      {error && <div className="alert error">{error}</div>}

      {loading ? (
        <div className="grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="card skeleton" key={index} />
          ))}
        </div>
      ) : (
        <div className="grid">
          {visible.map((item) => (
            <article className="card dish" key={item.id} onClick={() => setSelected(item)}>
              <div className="dish-art" aria-hidden>
                {emojiFor(item.category)}
              </div>
              <div className="dish-body">
                <h3>{item.name}</h3>
                <p className="muted small">{item.description}</p>
                {item.promotionTitle && (
                  <span className="promo-badge">
                    {item.promotionTitle} · −{item.discountPercent}%
                  </span>
                )}
                <div className="dish-meta">
                  <span className="muted small">{item.calories} ккал</span>
                </div>
                <div className="dish-footer">
                  <span className="price">
                    {money(item.price)}
                    {!!item.discountPercent && (
                      <span className="price-old">{money(item.basePrice ?? item.price)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="primary small"
                    onClick={(event) => {
                      event.stopPropagation();
                      add(item);
                    }}
                  >
                    В корзину
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <h3>Ничего не нашлось</h3>
          <p className="muted">Попробуйте изменить запрос или категорию.</p>
        </div>
      )}

      {count > 0 && (
        <button type="button" className="cart-fab" onClick={() => navigate("/cart")}>
          <span>Корзина · {count}</span>
          <strong>{money(total)}</strong>
        </button>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <div className="modal-art" aria-hidden>
              {emojiFor(selected.category)}
            </div>
            <div className="modal-body">
              <span className="tag">{selected.category}</span>
              <h2>{selected.name}</h2>
              <p className="muted">{selected.description}</p>
              {selected.promotionTitle && (
                <span className="promo-badge">
                  {selected.promotionTitle} · −{selected.discountPercent}%
                </span>
              )}
              <p className="muted small">{selected.calories} ккал</p>
              <div className="modal-footer">
                <span className="price big">
                  {money(selected.price)}
                  {!!selected.discountPercent && (
                    <span className="price-old">{money(selected.basePrice ?? selected.price)}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    add(selected);
                    setSelected(null);
                  }}
                >
                  Добавить в корзину
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
