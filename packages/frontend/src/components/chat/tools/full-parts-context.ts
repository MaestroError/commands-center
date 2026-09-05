import { createContext } from "react";

/**
 * Lets a tool card ask for its message's untruncated parts. The conversation
 * payload ships large tool output cut to a preview; expanding a card fetches
 * the rest and swaps it into the parts map.
 */
export type FullPartsContextValue = {
  loadFullParts: (messageId: string) => Promise<void>;
};

export const FullPartsContext = createContext<FullPartsContextValue | null>(null);
