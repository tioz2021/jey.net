"use client";

import { useLayoutEffect, useRef } from "react";

type StyleValue = string | number | undefined;

function cssProperty(key: string): string {
  return key.startsWith("--") ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Apply dynamic styles through CSSOM instead of a `style` attribute.
 * CSP `style-src 'self'` permits CSSOM property updates; it does not permit
 * parsed inline style attributes.
 */
export function useCssStyle<T extends HTMLElement>(values: Record<string, StyleValue>) {
  const ref = useRef<T>(null);
  const serialized = JSON.stringify(values);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    for (const [key, raw] of Object.entries(values)) {
      if (raw === undefined) continue;
      const value = typeof raw === "number" ? `${raw}px` : raw;
      element.style.setProperty(cssProperty(key), value);
    }
  }, [serialized]); // values are serialized to keep object identity out of the deps

  return ref;
}
