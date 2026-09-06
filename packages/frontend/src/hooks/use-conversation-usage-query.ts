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
  const wasBusy = useRef(false);
  // A turn that just finished has not been persisted yet, so that refetch must
  // sync first. The initial read follows a conversation GET, which already did.
  const needsSync = useRef(false);

  useEffect(() => {
    if (isBusy) {
      wasBusy.current = true;
      return;
    }

    if (!wasBusy.current || !conversationId) return;
    wasBusy.current = false;
    needsSync.current = true;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.conversationUsage(conversationId),
    });
  }, [isBusy, conversationId, queryClient]);

  return useQuery({
    queryKey: queryKeys.conversationUsage(conversationId ?? "missing"),
    queryFn: async () => {
      const sync = needsSync.current;
      needsSync.current = false;
      return getConversationUsage(conversationId ?? "", { sync });
    },
    enabled: Boolean(conversationId),
  });
}
