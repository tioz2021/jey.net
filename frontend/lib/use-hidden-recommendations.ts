"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "jey-hidden-recommendations";
const LIMIT = 300;

/** Recommendations dismissed in this browser, never removed from the library. */
export function useHiddenRecommendations() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const values = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(values)) {
        setHidden(new Set(values.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      // A corrupt local value should not break recommendations.
    }
  }, []);

  const hide = useCallback((key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next].slice(-LIMIT)));
      } catch {
        // Private mode may reject writes; hiding still works for this page.
      }
      return next;
    });
  }, []);

  return { hidden, hide };
}

export function publicRecommendationKey(authorId: string, itemId: string) {
  return `item:${authorId}:${itemId}`;
}

export function similarRecommendationKey(source: string, externalId: string) {
  return `similar:${source}:${externalId}`;
}
