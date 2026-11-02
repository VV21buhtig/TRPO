import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import { Header } from "./components/Header";
import { AuthProvider, useAuth } from "./state/auth";
import { CartProvider } from "./state/cart";
import { LoginPage } from "./pages/Login";
import { MenuPage } from "./pages/Menu";
import { CartPage } from "./pages/Cart";
import { CheckoutPage } from "./pages/Checkout";
import { SuccessPage } from "./pages/Success";
import { OrdersPage } from "./pages/Orders";
import { ProfilePage } from "./pages/Profile";

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page-loader">Загрузка…</div>;
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return children;
}

function Shell() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<MenuPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route
            path="/checkout"
            element={
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            }
          />
          <Route
            path="/success/:id"
            element={
              <RequireAuth>
                <SuccessPage />
              </RequireAuth>
            }
          />
          <Route
            path="/orders"
            element={
              <RequireAuth>
                <OrdersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>© 2026 Онлайн-заказ</span>
        <span className="muted">Учебный проект · ТРПО</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
