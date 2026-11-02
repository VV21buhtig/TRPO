import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../state/auth";

export function ProfilePage() {
  const { user, saveUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    try {
      const updated = await api.updateProfile(name.trim());
      saveUser(updated);
      setMessage("Данные сохранены");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Профиль</h1>
        <button
          type="button"
          className="link-danger"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          Выйти
        </button>
      </div>

      <section className="bonus-card">
        <div>
          <span className="muted small">Бонусный счёт</span>
          <strong className="bonus-value">{user.bonusBalance}</strong>
          <span className="muted small">бонусов</span>
        </div>
        <div className="bonus-hint">
          1 бонус = 1 ₽. Начисляем 5% с каждого оплаченного заказа.
        </div>
      </section>

      <section className="panel">
        <h2>Личные данные</h2>
        <form onSubmit={save} className="stack">
          <label className="field">
            <span>Имя</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Телефон</span>
            <input value={user.phone} disabled />
          </label>
          <label className="field">
            <span>Роль</span>
            <input value={user.role === "Customer" ? "Клиент" : user.role} disabled />
          </label>
          {message && <div className="alert success">{message}</div>}
          {error && <div className="alert error">{error}</div>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>История</h2>
        <p className="muted">Все ваши заказы и их статусы — в разделе «Заказы».</p>
        <div className="row gap">
          <Link className="secondary" to="/orders">
            Мои заказы
          </Link>
          <Link className="secondary" to="/">
            В меню
          </Link>
        </div>
      </section>

      <p className="muted small">
        Бонусов на счету: {money(user.bonusBalance)} · Баланс обновляется после
        оплаты заказа.
      </p>
    </div>
  );
}
