import { useMemo, type ReactNode } from "react";

import {
  PendingInteractionContext,
  type PendingToolInteraction,
} from "./pending-interaction-context";

type PendingInteractionProviderProps = {
  byCallId: Map<string, PendingToolInteraction>;
  cancel: (interaction: PendingToolInteraction) => void;
  children: ReactNode;
};

export function PendingInteractionProvider({
  byCallId,
  cancel,
  children,
}: PendingInteractionProviderProps) {
  const value = useMemo(() => ({ byCallId, cancel }), [byCallId, cancel]);

  return (
    <PendingInteractionContext.Provider value={value}>
      {children}
    </PendingInteractionContext.Provider>
  );
}
