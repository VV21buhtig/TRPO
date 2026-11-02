import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import * as client from "../api";

type AuthState = {
  user: client.User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  loginSms: (phone: string, code: string) => Promise<void>;
  logout: () => void;
  saveUser: (user: client.User) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<client.User | null>(client.getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client.getTokens()) {
      setLoading(false);
      return;
    }
    client.api
      .me()
      .then((fresh) => {
        setUser(fresh);
        client.setStoredUser(fresh);
      })
      .catch(() => {
        client.setTokens(null);
        client.setStoredUser(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await client.api.login(phone, password);
    client.setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    client.setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const loginSms = useCallback(async (phone: string, code: string) => {
    const res = await client.api.loginSms(phone, code);
    client.setTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    client.setStoredUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    client.setTokens(null);
    client.setStoredUser(null);
    setUser(null);
  }, []);

  const saveUser = useCallback((next: client.User) => {
    client.setStoredUser(next);
    setUser(next);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, loginSms, logout, saveUser }),
    [user, loading, login, loginSms, logout, saveUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
