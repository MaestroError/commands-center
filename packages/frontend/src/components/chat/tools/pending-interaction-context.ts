import { createContext } from "react";

export type PendingToolInteraction =
  | { kind: "permission"; requestId: string }
  | { kind: "question"; requestId: string }
  | { kind: "live-request"; requestId: string };

export type PendingInteractionContextValue = {
  byCallId: Map<string, PendingToolInteraction>;
  cancel: (interaction: PendingToolInteraction) => void;
};

export const PendingInteractionContext = createContext<PendingInteractionContextValue | null>(null);
