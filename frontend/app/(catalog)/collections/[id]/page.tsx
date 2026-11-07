"use client";

import { useParams } from "next/navigation";

import { CollectionDetailClient } from "@/components/collections/collection-detail-client";

export default function CollectionPage() {
  const params = useParams<{ id: string }>();
  return <CollectionDetailClient id={params.id} />;
}
