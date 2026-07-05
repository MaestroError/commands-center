import { apiFetch, readApiError, requestJson } from "./client";

import {
  specialistCatalogSchema,
  copyCustomToolToAgentsInputSchema as copyCustomToolToSpecialistsInputSchema,
  customToolAgentCopyListSchema,
  customToolBulkCopyResultSchema,
  customToolListSchema,
  customToolMutationResultSchema,
  createWorkspaceSkillInputSchema,
  specialistListSchema,
  specialistSchema,
  createSpecialistInputSchema,
  createCustomToolInputSchema,
  importAgentCustomToolInputSchema,
  workspaceSkillMutationResultSchema,
  workspaceSkillUploadInputSchema,
  type Specialist,
  type SpecialistCatalog,
  type CopyCustomToolToAgentsInput as CopyCustomToolToSpecialistsInput,
  type CreateCustomToolInput,
  type CustomTool,
  type CustomToolAgentCopy,
  type CustomToolMutationResult,
  type CreateWorkspaceSkillInput,
  type CreateSpecialistInput,
  type ImportAgentCustomToolInput as ImportSpecialistCustomToolInput,
  type UpdateSpecialistInput,
  type UpdateWorkspaceSkillCategoryInput,
  type WorkspaceSkillMutationResult,
  type WorkspaceSkillUploadInput,
  updateSpecialistInputSchema,
} from "@cc/shared/schemas";

export async function listSpecialists(): Promise<Specialist[]> {
  return requestJson<Specialist[]>("/api/specialists", specialistListSchema);
}

export async function getSpecialistBySlug(slug: string): Promise<Specialist> {
  return requestJson<Specialist>(
    `/api/specialists/by-slug/${encodeURIComponent(slug)}`,
    specialistSchema,
  );
}

export async function getSpecialistCatalog(): Promise<SpecialistCatalog> {
  return requestJson<SpecialistCatalog>("/api/specialists/catalog", specialistCatalogSchema);
}

export async function listCustomTools(): Promise<CustomTool[]> {
  return requestJson<CustomTool[]>("/api/custom-tools", customToolListSchema);
}

export async function createCustomTool(
  input: CreateCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    "/api/custom-tools",
    customToolMutationResultSchema,
    {
      method: "POST",
      body: createCustomToolInputSchema.parse(input),
    },
  );
}

export async function deleteCustomTool(slug: string): Promise<void> {
  const response = await apiFetch(`/api/custom-tools/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function createWorkspaceSkill(
  input: CreateWorkspaceSkillInput,
): Promise<WorkspaceSkillMutationResult> {
  return requestJson<WorkspaceSkillMutationResult>(
    "/api/workspace-skills",
    workspaceSkillMutationResultSchema,
    {
      method: "POST",
      body: createWorkspaceSkillInputSchema.parse(input),
    },
  );
}

export async function uploadWorkspaceSkill(
  input: WorkspaceSkillUploadInput,
): Promise<WorkspaceSkillMutationResult> {
  const body = workspaceSkillUploadInputSchema.parse(input);
  const response = await apiFetch("/api/workspace-skills/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (response.status === 400) {
    const details =
      payload && typeof payload === "object" && "error" in payload
        ? (
            payload as {
              error?: {
                details?: { renameSuggestedFrom?: string; renameSuggestedTo?: string };
              };
            }
          ).error?.details
        : undefined;

    if (
      details?.renameSuggestedFrom &&
      details?.renameSuggestedTo &&
      details.renameSuggestedFrom !== details.renameSuggestedTo
    ) {
      throw new WorkspaceSkillUploadRenameError(
        readApiError(payload, response.status, response.statusText),
        details.renameSuggestedFrom,
        details.renameSuggestedTo,
      );
    }
  }

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return workspaceSkillMutationResultSchema.parse(payload);
}

export async function deleteWorkspaceSkill(slug: string): Promise<void> {
  const response = await apiFetch(`/api/workspace-skills/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function updateWorkspaceSkillCategory(
  slug: string,
  input: UpdateWorkspaceSkillCategoryInput,
): Promise<WorkspaceSkillMutationResult> {
  const response = await apiFetch(`/api/workspace-skills/${encodeURIComponent(slug)}/category`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new Error(readApiError(payload, response.status, response.statusText));
  }

  return workspaceSkillMutationResultSchema.parse(payload);
}

export async function copyCustomToolToSpecialists(
  slug: string,
  input: CopyCustomToolToSpecialistsInput,
): Promise<{ copied: Array<{ agentId: string; agentSlug: string; overwritten: boolean }> }> {
  return requestJson(
    `/api/custom-tools/${encodeURIComponent(slug)}/copy-to-specialists`,
    customToolBulkCopyResultSchema,
    {
      method: "POST",
      body: copyCustomToolToSpecialistsInputSchema.parse(input),
    },
  );
}

export async function listSpecialistCustomTools(agentId: string): Promise<CustomToolAgentCopy[]> {
  return requestJson<CustomToolAgentCopy[]>(
    `/api/specialists/${encodeURIComponent(agentId)}/custom-tools`,
    customToolAgentCopyListSchema,
  );
}

export async function copySpecialistCustomToolToGlobal(
  agentId: string,
  slug: string,
  input: ImportSpecialistCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    `/api/specialists/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}/copy-to-global`,
    customToolMutationResultSchema,
    {
      method: "POST",
      body: importAgentCustomToolInputSchema.parse(input),
    },
  );
}

export async function moveSpecialistCustomToolToGlobal(
  agentId: string,
  slug: string,
  input: ImportSpecialistCustomToolInput,
): Promise<CustomToolMutationResult> {
  return requestJson<CustomToolMutationResult>(
    `/api/specialists/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}/move-to-global`,
    customToolMutationResultSchema,
    {
      method: "POST",
      body: importAgentCustomToolInputSchema.parse(input),
    },
  );
}

export async function deleteSpecialistCustomTool(agentId: string, slug: string): Promise<void> {
  const response = await apiFetch(
    `/api/specialists/${encodeURIComponent(agentId)}/custom-tools/${encodeURIComponent(slug)}`,
    {
      method: "DELETE",
    },
  );

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function createSpecialist(input: CreateSpecialistInput): Promise<Specialist> {
  return requestJson<Specialist>("/api/specialists", specialistSchema, {
    method: "POST",
    body: createSpecialistInputSchema.parse(input),
  });
}

export async function updateSpecialist(
  id: string,
  input: UpdateSpecialistInput,
): Promise<Specialist> {
  return requestJson<Specialist>(`/api/specialists/${encodeURIComponent(id)}`, specialistSchema, {
    method: "PATCH",
    body: updateSpecialistInputSchema.parse(input),
  });
}

export async function archiveSpecialist(id: string): Promise<Specialist> {
  return requestJson<Specialist>(`/api/specialists/${encodeURIComponent(id)}`, specialistSchema, {
    method: "DELETE",
  });
}

export class WorkspaceSkillUploadRenameError extends Error {
  readonly renameSuggestedFrom: string;
  readonly renameSuggestedTo: string;

  constructor(message: string, renameSuggestedFrom: string, renameSuggestedTo: string) {
    super(message);
    this.name = "WorkspaceSkillUploadRenameError";
    this.renameSuggestedFrom = renameSuggestedFrom;
    this.renameSuggestedTo = renameSuggestedTo;
  }
}
