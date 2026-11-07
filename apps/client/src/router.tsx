import { Route, Routes } from "react-router-dom";

import { App } from "./App";

/** Routes shared by the desktop and future web entries. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<App />} />
    </Routes>
  );
}
