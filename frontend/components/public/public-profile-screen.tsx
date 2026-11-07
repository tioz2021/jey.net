"use client";

import { useEffect, useState } from "react";

import { PublicProfileView } from "@/components/public-profile";
import type { PublicProfileResponse } from "@/lib/types";
import { LoadingScreen } from "@/components/loading-screen";

export function PublicProfileScreen({ id }: { id: string }) {
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/public/users/${encodeURIComponent(id)}`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setData)
      .catch(() => {
        fetch("/api/v1/me/profile", { credentials: "include" })
          .then((response) => (response.ok ? response.json() : Promise.reject()))
          .then(setData)
          .catch(() => setError(true));
      });
  }, [id]);

  if (error) return <main><p>Профиль не найден</p></main>;
  if (!data) return <main><LoadingScreen /></main>;
  return <PublicProfileView collections={data.collections ?? []} items={data.items} preview={data.preview} profile={data.profile} />;
}
