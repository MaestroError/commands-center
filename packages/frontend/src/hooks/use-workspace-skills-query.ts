import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceSkill,
  deleteWorkspaceSkill,
  updateWorkspaceSkillCategory,
  uploadWorkspaceSkill,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateWorkspaceSkillInput,
  UpdateWorkspaceSkillCategoryInput,
  WorkspaceSkillUploadInput,
} from "@cc/shared/schemas";

export function useWorkspaceSkillMutations() {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceSkills }),
      queryClient.invalidateQueries({ queryKey: queryKeys.specialistCatalog }),
      queryClient.invalidateQueries({ queryKey: queryKeys.specialists }),
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
    updateCategory: useMutation({
      mutationFn: (input: { slug: string; body: UpdateWorkspaceSkillCategoryInput }) =>
        updateWorkspaceSkillCategory(input.slug, input.body),
      onSuccess: invalidate,
    }),
  };
}
