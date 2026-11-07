import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

const UserContext = createContext<{ user: null; setUser: () => void }>({
  user: null,
  setUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user] = useState(null);
  return <UserContext.Provider value={{ user, setUser: () => {} }}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
