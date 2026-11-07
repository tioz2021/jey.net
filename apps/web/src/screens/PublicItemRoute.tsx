import { useParams } from "react-router-dom";

import { PublicItemScreen } from "@/components/public/public-item-screen";

export function PublicItemRoute() {
  const { id = "", itemId = "" } = useParams<{ id: string; itemId: string }>();
  return <PublicItemScreen id={id} itemId={itemId} />;
}
