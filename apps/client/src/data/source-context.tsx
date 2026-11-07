import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { ItemSource } from "./source";

const SourceContext = createContext<ItemSource | null>(null);

/** The only data boundary shared by web and desktop entries. */
export function SourceProvider({
  source,
  children,
}: {
  source: ItemSource;
  children: ReactNode;
}) {
  return <SourceContext.Provider value={source}>{children}</SourceContext.Provider>;
}

export function useItemSource(): ItemSource {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useItemSource must be used inside SourceProvider");
  return source;
}
