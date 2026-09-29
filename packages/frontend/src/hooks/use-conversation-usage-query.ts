import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getConversationUsage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Cumulative token and cost totals for a whole conversation.
 *
 * Server-aggregated on purpose: the client holds only the newest page of
 * messages, so anything summed in the browser would under-report a long chat.
 *
 * Refreshed when a turn finishes rather than polled. Nothing else invalidates
 * this key, so without that the dialog would keep showing the total captured
 * when the chat was opened.
 */
export function useConversationUsageQuery(conversationId?: string, isBusy = false) {
  const queryClient = useQueryClient();
  const busyConversationId = useRef<string | undefined>(undefined);
  const pendingSyncs = useRef(new Map<string, symbol>());

  useEffect(() => {
    if (isBusy) {
      busyConversationId.current = conversationId;
      return;
    }

    const finishedConversationId = busyConversationId.current;
    busyConversationId.current = undefined;
    if (!conversationId || finishedConversationId !== conversationId) return;
    pendingSyncs.current.set(conversationId, Symbol());
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversationUsage(conversationId),
    });
  }, [isBusy, conversationId, queryClient]);

  return useQuery({
    queryKey: queryKeys.conversationUsage(conversationId ?? "missing"),
    queryFn: async () => {
      const id = conversationId ?? "";
      const pendingSync = pendingSyncs.current.get(id);
      const usage = await getConversationUsage(id, { sync: pendingSync !== undefined });
      if (pendingSync !== undefined && pendingSyncs.current.get(id) === pendingSync) {
        pendingSyncs.current.delete(id);
      }
      return usage;
    },
    enabled: Boolean(conversationId),
  });
}
