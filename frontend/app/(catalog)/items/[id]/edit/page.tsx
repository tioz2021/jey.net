"use client";

import { useParams } from "next/navigation";

import { ItemEditorClient } from "@/components/items/item-editor-client";
import { httpClientSource } from "@/lib/client-source";

export default function EditItemPage() {
  const params = useParams<{ id: string }>();
  return (
    <ItemEditorClient
      backHref={`/items/${params.id}`}
      id={params.id}
      source={httpClientSource}
    />
  );
}
