import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../state/auth";

type Mode = "password" | "sms";

export function LoginPage() {
  const { login, loginSms, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [mode, setMode] = useState<Mode>("password");
  const [phone, setPhone] = useState("+79991234567");
  const [password, setPassword] = useState("12345");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to={from} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "password") {
        await login(phone.trim(), password);
      } else {
        await loginSms(phone.trim(), code.trim());
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setError("");
    try {
      const res = await api.smsCode(phone.trim());
      setSent(true);
      setCode(res.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить код");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo big">
          <span className="logo-mark">О</span>
          <span className="logo-text">Онлайн-заказ</span>
        </div>
        <h1>Вход в личный кабинет</h1>
        <p className="muted">
          Заказывайте без очереди, копите бонусы и следите за статусом заказа.
        </p>

        <div className="tabs">
          <button
            type="button"
            className={mode === "password" ? "tab active" : "tab"}
            onClick={() => setMode("password")}
          >
            По паролю
          </button>
          <button
            type="button"
            className={mode === "sms" ? "tab active" : "tab"}
            onClick={() => setMode("sms")}
          >
            По SMS-коду
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Телефон</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 999 123-45-67"
              autoComplete="tel"
            />
          </label>

          {mode === "password" ? (
            <label className="field">
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
          ) : (
            <div className="field">
              <span>Код подтверждения</span>
              <div className="row">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="0000"
                  inputMode="numeric"
                />
                <button type="button" className="secondary" onClick={sendCode}>
                  {sent ? "Отправить снова" : "Получить код"}
                </button>
              </div>
              {sent && <small className="muted">Демо-режим: код 0000</small>}
            </div>
          )}

          {error && <div className="alert error">{error}</div>}

          <button className="primary wide" type="submit" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>

        <div className="demo-hint">
          <strong>Демо-доступ</strong>
          <div>Клиент: +79991234567 / 12345</div>
          <div>Оператор: +79990000001 / 12345</div>
          <div>Администратор: +79990000002 / 12345</div>
        </div>
      </div>
    </div>
  );
}
