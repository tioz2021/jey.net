"use client";

import { useState } from "react";

import { apiAsset } from "@/lib/media";

import styles from "./cast-photo.module.css";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/**
 * Actor portrait from TMDB through our proxy. Photos are never stored: when
 * the image is missing or fails, a neutral initials tile is shown instead.
 */
export function CastPhoto({
  name,
  profilePath,
}: {
  name: string;
  profilePath: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (!profilePath || failed) {
    return (
      <span aria-hidden="true" className={styles.placeholder}>
        {initials(name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied TMDB portrait
    <img
      alt=""
      className={styles.photo}
      decoding="async"
      loading="lazy"
      onError={() => setFailed(true)}
      src={apiAsset(`/api/v1/movies/image?size=w185&path=${encodeURIComponent(profilePath)}`)}
    />
  );
}
