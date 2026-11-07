import { useState } from "react";

import { ItemsQueryProvider } from "@/components/items/query-context";
import { ItemsScreen } from "@/components/items/items-screen";

export function ItemsRoute() {
  const [search] = useState(() => typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, ""));
  return <ItemsQueryProvider initialSearch={search}><ItemsScreen /></ItemsQueryProvider>;
}
