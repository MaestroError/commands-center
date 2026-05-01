import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceSkill,
  deleteWorkspaceSkill,
  listWorkspaceSkills,
  uploadWorkspaceSkill,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CreateWorkspaceSkillInput, WorkspaceSkillUploadInput } from "@cc/shared/schemas";

export function useWorkspaceSkillsQuery() {
  return useQuery({
    queryKey: queryKeys.workspaceSkills,
    queryFn: () => listWorkspaceSkills(),
  });
}

export function useWorkspaceSkillMutations() {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSkills }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agentCatalog }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents }),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateWorkspaceSkillInput) => createWorkspaceSkill(input),
      onSuccess: invalidate,
    }),
    upload: useMutation({
      mutationFn: (input: WorkspaceSkillUploadInput) => uploadWorkspaceSkill(input),
      onSuccess: invalidate,
    }),
    delete: useMutation({
      mutationFn: (slug: string) => deleteWorkspaceSkill(slug),
      onSuccess: invalidate,
    }),
  };
}
