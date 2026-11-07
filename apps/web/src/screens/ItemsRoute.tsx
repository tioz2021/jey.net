import { useLocation } from "react-router-dom";

import { ItemsQueryProvider } from "@/components/items/query-context";
import { ItemsScreen } from "@/components/items/items-screen";

export function ItemsRoute() {
  const location = useLocation();
  const search = location.search.replace(/^\?/, "");
  return (
    <ItemsQueryProvider key={location.key} initialSearch={search}>
      <ItemsScreen />
    </ItemsQueryProvider>
  );
}
