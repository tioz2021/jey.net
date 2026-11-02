"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";

import { api } from "./api";
import type { User } from "./types";

interface UserContextValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

/**
 * Keeps the current account in memory for the whole session.
 *
 * The provider asks `/me` once on mount; pages that need the account read it
 * from here instead of fetching again. A missing session is not an error: it
 * simply means "anonymous".
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await api.auth.me({ redirectOnUnauthorized: false });
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <UserContext.Provider value={{ user, loading, setUser, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used inside UserProvider");
  }

  return context;
}
