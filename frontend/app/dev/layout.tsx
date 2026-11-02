import type { Metadata } from "next";
import type { ReactNode } from "react";

// A component playground: useful in development, never in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DevLayout({ children }: { children: ReactNode }) {
  return children;
}
