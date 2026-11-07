import { Outlet } from "react-router-dom";

import { AppShell } from "@/components/app-shell";

export function AppFrame() {
  return <AppShell><Outlet /></AppShell>;
}
