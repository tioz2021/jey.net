import type { User } from "@/lib/types";

const LOCAL_USER = {
  id: "local",
  email: "local@localhost",
  display_name: "Локальный пользователь",
  handle: "local",
  locale: "ru",
  is_public: false,
  role: "user",
  email_verified: false,
  created_at: "",
} as unknown as User;

export function useUser() {
  return {
    user: LOCAL_USER,
    loading: false,
    setUser() {},
    async refresh() {},
  };
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  return children;
}
