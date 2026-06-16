'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, getStoredToken, setStoredToken } from './api';
import type { AuthResponse, SafeUser } from './types';

type AuthContextValue = {
  user: SafeUser | null;
  agencyName: string | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'cm_user';
const AGENCY_KEY = 'cm_agency';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = getStoredToken();
    const storedUser = localStorage.getItem(USER_KEY);
    const storedAgency = localStorage.getItem(AGENCY_KEY);
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser) as SafeUser);
      setAgencyName(storedAgency);
    }
    setLoading(false);
  }, []);

  const persistSession = useCallback((data: AuthResponse) => {
    setStoredToken(data.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    localStorage.setItem(AGENCY_KEY, data.agency.name);
    setToken(data.accessToken);
    setUser(data.user);
    setAgencyName(data.agency.name);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      persistSession(data);
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AGENCY_KEY);
    setToken(null);
    setUser(null);
    setAgencyName(null);
  }, []);

  const value = useMemo(
    () => ({ user, agencyName, token, loading, login, logout }),
    [user, agencyName, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
