"use client";

import { useParams } from "next/navigation";

import { ItemDetailClient } from "@/components/items/item-detail-client";
import { httpClientSource } from "@/lib/client-source";

export default function ItemPage() {
  const params = useParams<{ id: string }>();
  return (
    <ItemDetailClient
      backHref="/items"
      editHref={`/items/${params.id}/edit`}
      id={params.id}
      source={httpClientSource}
    />
  );
}
