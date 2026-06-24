import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSystemPrompt, getSystemPrompts, resetSystemPrompt, saveSystemPrompt } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import type { SystemPromptDetail } from "@cc/shared/schemas";

export function useSystemPromptsQuery() {
  return useQuery({
    queryKey: queryKeys.systemPrompts,
    queryFn: () => getSystemPrompts(),
  });
}

export function useSystemPromptQuery(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.systemPrompt(id),
    queryFn: () => getSystemPrompt(id),
    enabled,
  });
}

export function useSaveSystemPromptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => saveSystemPrompt(id, body),
    onSuccess: (detail) => applySystemPromptUpdate(queryClient, id, detail),
  });
}

export function useResetSystemPromptMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetSystemPrompt(id),
    onSuccess: (detail) => applySystemPromptUpdate(queryClient, id, detail),
  });
}

function applySystemPromptUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  detail: SystemPromptDetail,
): void {
  queryClient.setQueryData(queryKeys.systemPrompt(id), detail);
  // Keep the list's per-prompt isCustomized badge in sync.
  void queryClient.invalidateQueries({ queryKey: queryKeys.systemPrompts });
}
