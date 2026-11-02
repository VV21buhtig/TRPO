import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../state/auth";
import { useCart } from "../state/cart";

export function Header() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">О</span>
          <span className="logo-text">Онлайн-заказ</span>
        </Link>

        <nav className="nav">
          <NavLink to="/" end>
            Меню
          </NavLink>
          <NavLink to="/orders">Заказы</NavLink>
          <NavLink to="/profile">Профиль</NavLink>
        </nav>

        <div className="header-right">
          <span className="city">Москва</span>
          <Link to="/cart" className="cart-button">
            Корзина
            {count > 0 && <span className="badge">{count}</span>}
          </Link>
          {user ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              title="Выйти"
            >
              {user.name.split(" ")[0]}
            </button>
          ) : (
            <Link to="/login" className="ghost">
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
