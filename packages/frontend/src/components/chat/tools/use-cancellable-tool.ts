import { useContext } from "react";

import { PendingInteractionContext } from "./pending-interaction-context";

/**
 * Returns a cancel callback for the given tool call id, or `undefined` when
 * that call isn't currently blocked on a pending permission/question (or no
 * provider is mounted, e.g. outside a chat page).
 */
export function useCancellableTool(callId: string | undefined): (() => void) | undefined {
  const context = useContext(PendingInteractionContext);

  if (!context || !callId) {
    return undefined;
  }

  const interaction = context.byCallId.get(callId);
  if (!interaction) {
    return undefined;
  }

  return () => {
    context.cancel(interaction);
  };
}
