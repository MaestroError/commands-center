import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getConversationSystemPrompts, setConversationSystemPromptEnabled } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import type { ResolvedSystemPrompt } from "@cc/shared/schemas";

export function useConversationSystemPromptsQuery(conversationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversationSystemPrompts(conversationId ?? ""),
    queryFn: () => getConversationSystemPrompts(conversationId ?? ""),
    enabled: Boolean(conversationId),
  });
}

export function useSetConversationSystemPromptEnabledMutation(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.conversationSystemPrompts(conversationId ?? "");

  return useMutation({
    mutationFn: ({ promptId, enabled }: { promptId: string; enabled: boolean }) =>
      setConversationSystemPromptEnabled(conversationId ?? "", promptId, enabled),
    // Optimistically flip the toggle so the UI feels instant; roll back on error.
    onMutate: async ({ promptId, enabled }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ResolvedSystemPrompt[]>(queryKey);
      if (previous) {
        queryClient.setQueryData<ResolvedSystemPrompt[]>(
          queryKey,
          previous.map((prompt) => (prompt.id === promptId ? { ...prompt, enabled } : prompt)),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
