import { useMemo, type ReactNode } from "react";

import { FullPartsContext } from "./full-parts-context";

type FullPartsProviderProps = {
  loadFullParts: (messageId: string) => Promise<void>;
  children: ReactNode;
};

export function FullPartsProvider({ loadFullParts, children }: FullPartsProviderProps) {
  const value = useMemo(() => ({ loadFullParts }), [loadFullParts]);

  return <FullPartsContext.Provider value={value}>{children}</FullPartsContext.Provider>;
}
