"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useUser } from "@/lib/user-context";

export function LogoutButton() {
  const router = useRouter();
  const { setUser } = useUser();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    try {
      await api.auth.logout();
    } catch {
      // The session may already be gone; clearing local state is enough.
    }

    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" loading={pending} onClick={handleLogout}>
      Выйти
    </Button>
  );
}
