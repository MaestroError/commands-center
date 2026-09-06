import { useQuery } from "@tanstack/react-query";

import { getConversationUsage } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Cumulative token and cost totals for a whole conversation.
 *
 * Server-aggregated on purpose: the client holds only the newest page of
 * messages, so anything summed in the browser would under-report a long chat.
 */
export function useConversationUsageQuery(conversationId?: string) {
  return useQuery({
    queryKey: queryKeys.conversationUsage(conversationId ?? "missing"),
    queryFn: () => getConversationUsage(conversationId ?? ""),
    enabled: Boolean(conversationId),
  });
}
