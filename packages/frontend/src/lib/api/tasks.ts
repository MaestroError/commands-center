import { apiFetch, readApiError, requestJson } from "./client";

import {
  cancelTaskRunInputSchema,
  addArtifactInputSchema,
  artifactDeliveryUrlsResponseSchema,
  artifactSchema,
  createArtifactShareLinkInputSchema,
  createArtifactShareLinkResponseSchema,
  conversationSnapshotSchema,
  createTaskFeedbackInputSchema,
  createTaskInputSchema,
  createTaskRunFollowupInputSchema,
  createTaskTemplateInputSchema,
  listTasksQuerySchema,
  artifactListResponseSchema,
  taskListSchema,
  taskFeedbackThreadListSchema,
  taskFeedbackThreadSchema,
  taskQueuePreviewInputSchema,
  taskQueuePreviewSchema,
  taskRunFollowupSchema,
  taskRunListSchema,
  taskRunSchema,
  taskRunSessionInspectionSchema,
  taskSchedulerStateListSchema,
  taskSchema,
  taskSubtaskListSchema,
  taskSubtaskProgressListSchema,
  taskTemplateListSchema,
  taskTemplateRunNowInputSchema,
  taskTemplateSchema,
  updateTaskContextInputSchema,
  updateTaskFeedbackInputSchema,
  updateTaskTemplateInputSchema,
  uploadTaskContextAttachmentInputSchema,
  uploadTaskContextAttachmentResponseSchema,
  type CancelTaskRunInput,
  type AddArtifactInput,
  type Artifact,
  type ArtifactDeliveryUrlsResponse,
  type CreateTaskFeedbackInput,
  type CreateArtifactShareLinkInput,
  type CreateArtifactShareLinkResponse,
  type CreateTaskInput,
  type CreateTaskRunFollowupInput,
  type CreateTaskTemplateInput,
  type ConversationSnapshot,
  type ListTasksQuery,
  type QueueTaskInput,
  type Task,
  type ArtifactListResponse,
  type TaskFeedbackThread,
  type TaskQueuePreview,
  type TaskTemplate,
  type TaskTemplateRunNowInput,
  type TaskRun,
  type TaskRunFollowup,
  type TaskRunSessionInspection,
  type TaskSchedulerState,
  type TaskSubtask,
  type TaskSubtaskProgress,
  type UpdateTaskInput,
  type UpdateTaskContextInput,
  type UpdateTaskFeedbackInput,
  type UpdateTaskTemplateInput,
  type UploadTaskContextAttachmentInput,
  type UploadTaskContextAttachmentResponse,
  updateTaskInputSchema,
} from "@cc/shared/schemas";

export async function listTasks(query: Partial<ListTasksQuery> = {}): Promise<Task[]> {
  const parsed = listTasksQuerySchema.parse(query);
  const params = new URLSearchParams();

  if (parsed.status) params.set("status", parsed.status);
  if (parsed.agentId) params.set("agentId", parsed.agentId);
  if (parsed.includeArchived) params.set("includeArchived", "true");

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<Task[]>(`/api/tasks${suffix}`, taskListSchema);
}

export async function listArchivedTasks(): Promise<Task[]> {
  return requestJson<Task[]>("/api/tasks/archive", taskListSchema);
}

export async function listTaskTemplates(): Promise<TaskTemplate[]> {
  return requestJson<TaskTemplate[]>("/api/tasks/templates", taskTemplateListSchema);
}

export async function getTaskTemplate(id: string): Promise<TaskTemplate> {
  return requestJson<TaskTemplate>(
    `/api/tasks/templates/${encodeURIComponent(id)}`,
    taskTemplateSchema,
  );
}

export async function listTaskTemplateTasks(id: string): Promise<Task[]> {
  return requestJson<Task[]>(
    `/api/tasks/templates/${encodeURIComponent(id)}/tasks`,
    taskListSchema,
  );
}

export async function createTaskTemplate(input: CreateTaskTemplateInput): Promise<TaskTemplate> {
  return requestJson<TaskTemplate>("/api/tasks/templates", taskTemplateSchema, {
    method: "POST",
    body: createTaskTemplateInputSchema.parse(input),
  });
}

export async function updateTaskTemplate(
  id: string,
  input: UpdateTaskTemplateInput,
): Promise<TaskTemplate> {
  return requestJson<TaskTemplate>(
    `/api/tasks/templates/${encodeURIComponent(id)}`,
    taskTemplateSchema,
    {
      method: "PATCH",
      body: updateTaskTemplateInputSchema.parse(input),
    },
  );
}

export async function enableTaskTemplate(id: string): Promise<TaskTemplate> {
  return requestJson<TaskTemplate>(
    `/api/tasks/templates/${encodeURIComponent(id)}/enable`,
    taskTemplateSchema,
    { method: "POST" },
  );
}

export async function disableTaskTemplate(id: string): Promise<TaskTemplate> {
  return requestJson<TaskTemplate>(
    `/api/tasks/templates/${encodeURIComponent(id)}/disable`,
    taskTemplateSchema,
    { method: "POST" },
  );
}

export async function createTaskFromTemplate(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/templates/${encodeURIComponent(id)}/tasks`, taskSchema, {
    method: "POST",
  });
}

export async function runTaskTemplateNow(
  id: string,
  input: TaskTemplateRunNowInput = {},
): Promise<TaskRun> {
  return requestJson<TaskRun>(
    `/api/tasks/templates/${encodeURIComponent(id)}/run-now`,
    taskRunSchema,
    {
      method: "POST",
      body: taskTemplateRunNowInputSchema.parse(input),
    },
  );
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return requestJson<Task>("/api/tasks", taskSchema, {
    method: "POST",
    body: createTaskInputSchema.parse(input),
  });
}

export async function getTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}`, taskSchema);
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}`, taskSchema, {
    method: "PATCH",
    body: updateTaskInputSchema.parse(input),
  });
}

export async function updateTaskContext(id: string, input: UpdateTaskContextInput): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/context`, taskSchema, {
    method: "PATCH",
    body: updateTaskContextInputSchema.parse(input),
  });
}

export async function uploadTaskContextAttachment(
  id: string,
  input: UploadTaskContextAttachmentInput,
): Promise<UploadTaskContextAttachmentResponse> {
  return requestJson<UploadTaskContextAttachmentResponse>(
    `/api/tasks/${encodeURIComponent(id)}/context/attachments`,
    uploadTaskContextAttachmentResponseSchema,
    {
      method: "POST",
      body: uploadTaskContextAttachmentInputSchema.parse(input),
    },
  );
}

export async function listTaskFeedback(taskId: string): Promise<TaskFeedbackThread[]> {
  return requestJson<TaskFeedbackThread[]>(
    `/api/tasks/${encodeURIComponent(taskId)}/feedback`,
    taskFeedbackThreadListSchema,
  );
}

export async function createTaskFeedback(
  taskId: string,
  input: CreateTaskFeedbackInput,
): Promise<TaskFeedbackThread> {
  return requestJson<TaskFeedbackThread>(
    `/api/tasks/${encodeURIComponent(taskId)}/feedback`,
    taskFeedbackThreadSchema,
    {
      method: "POST",
      body: createTaskFeedbackInputSchema.parse(input),
    },
  );
}

export async function updateTaskFeedback(
  taskId: string,
  feedbackId: string,
  input: UpdateTaskFeedbackInput,
): Promise<TaskFeedbackThread> {
  return requestJson<TaskFeedbackThread>(
    `/api/tasks/${encodeURIComponent(taskId)}/feedback/${encodeURIComponent(feedbackId)}`,
    taskFeedbackThreadSchema,
    {
      method: "PATCH",
      body: updateTaskFeedbackInputSchema.parse(input),
    },
  );
}

export async function listTaskSubtasks(taskId: string): Promise<TaskSubtask[]> {
  return requestJson<TaskSubtask[]>(
    `/api/tasks/${encodeURIComponent(taskId)}/subtasks`,
    taskSubtaskListSchema,
  );
}

export async function listTaskSubtaskProgress(taskIds: string[]): Promise<TaskSubtaskProgress[]> {
  const params = new URLSearchParams();
  params.set("taskIds", taskIds.join(","));
  return requestJson<TaskSubtaskProgress[]>(
    `/api/tasks/subtask-progress?${params.toString()}`,
    taskSubtaskProgressListSchema,
  );
}

export async function previewTaskQueue(
  id: string,
  input: Partial<Omit<QueueTaskInput, "taskId">> = { triggerSource: "manual" },
): Promise<TaskQueuePreview> {
  return requestJson<TaskQueuePreview>(
    `/api/tasks/${encodeURIComponent(id)}/queue/preview`,
    taskQueuePreviewSchema,
    {
      method: "POST",
      body: taskQueuePreviewInputSchema.parse(input),
    },
  );
}

export async function duplicateTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/duplicate`, taskSchema, {
    method: "POST",
  });
}

export async function archiveTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/archive`, taskSchema, {
    method: "POST",
  });
}

export async function acceptTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/accept`, taskSchema, {
    method: "POST",
  });
}

export async function restoreTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/restore`, taskSchema, {
    method: "POST",
  });
}

export async function enableTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/enable`, taskSchema, {
    method: "POST",
  });
}

export async function disableTask(id: string): Promise<Task> {
  return requestJson<Task>(`/api/tasks/${encodeURIComponent(id)}/disable`, taskSchema, {
    method: "POST",
  });
}

export async function deleteTask(id: string): Promise<void> {
  const response = await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok && response.status !== 204) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function listTaskRuns(taskId: string): Promise<TaskRun[]> {
  return requestJson<TaskRun[]>(`/api/tasks/${encodeURIComponent(taskId)}/runs`, taskRunListSchema);
}

export async function getTaskRun(taskId: string, runId: string): Promise<TaskRun> {
  return requestJson<TaskRun>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`,
    taskRunSchema,
  );
}

export async function listRunFollowups(taskId: string, runId: string): Promise<TaskRunFollowup[]> {
  return requestJson<TaskRunFollowup[]>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/followups`,
    taskRunFollowupSchema.array(),
  );
}

export async function createRunFollowup(
  taskId: string,
  runId: string,
  input: CreateTaskRunFollowupInput,
): Promise<TaskRunFollowup> {
  return requestJson<TaskRunFollowup>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/followups`,
    taskRunFollowupSchema,
    {
      method: "POST",
      body: createTaskRunFollowupInputSchema.parse(input),
    },
  );
}

export async function listConversationArtifacts(
  conversationId: string,
): Promise<ArtifactListResponse> {
  return requestJson<ArtifactListResponse>(
    `/api/conversations/${encodeURIComponent(conversationId)}/artifacts`,
    artifactListResponseSchema,
  );
}

export async function addConversationArtifact(
  conversationId: string,
  input: AddArtifactInput,
): Promise<Artifact> {
  return requestJson<Artifact>(
    `/api/conversations/${encodeURIComponent(conversationId)}/artifacts`,
    artifactSchema,
    {
      method: "POST",
      body: addArtifactInputSchema.parse(input),
    },
  );
}

// Sharing is artifact-centric and origin-agnostic — a link is keyed only by the
// artifact id, so the same endpoints serve chat and task-run artifacts.

export async function createArtifactShareLink(
  artifactId: string,
  input: CreateArtifactShareLinkInput = {},
): Promise<CreateArtifactShareLinkResponse> {
  return requestJson<CreateArtifactShareLinkResponse>(
    `/api/artifacts/${encodeURIComponent(artifactId)}/share-links`,
    createArtifactShareLinkResponseSchema,
    {
      method: "POST",
      body: createArtifactShareLinkInputSchema.parse(input),
    },
  );
}

// The template-driven ("MCP") delivery URLs for an artifact, if the source
// template enables them. Distinct from the manual, revocable share links.
export async function getArtifactDeliveryUrls(
  artifactId: string,
): Promise<ArtifactDeliveryUrlsResponse> {
  return requestJson<ArtifactDeliveryUrlsResponse>(
    `/api/artifacts/${encodeURIComponent(artifactId)}/delivery-urls`,
    artifactDeliveryUrlsResponseSchema,
  );
}

export async function revokeArtifactShareLink(artifactId: string, shareId: string): Promise<void> {
  const response = await apiFetch(
    `/api/artifacts/${encodeURIComponent(artifactId)}/share-links/${encodeURIComponent(shareId)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new Error(readApiError(payload, response.status, response.statusText));
  }
}

export async function inspectTaskRunSession(
  taskId: string,
  runId: string,
): Promise<TaskRunSessionInspection> {
  return requestJson<TaskRunSessionInspection>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/session`,
    taskRunSessionInspectionSchema,
  );
}

export async function openTaskRunInChat(
  taskId: string,
  runId: string,
): Promise<ConversationSnapshot> {
  return requestJson<ConversationSnapshot>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/open-in-chat`,
    conversationSnapshotSchema,
    { method: "POST" },
  );
}

export async function queueTask(
  id: string,
  input: Partial<Omit<QueueTaskInput, "taskId">> = { triggerSource: "manual" },
): Promise<TaskRun> {
  return requestJson<TaskRun>(`/api/tasks/${encodeURIComponent(id)}/queue`, taskRunSchema, {
    method: "POST",
    body: input,
  });
}

export async function cancelTaskRun(
  taskId: string,
  runId: string,
  input: CancelTaskRunInput = {},
): Promise<TaskRun> {
  return requestJson<TaskRun>(
    `/api/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/cancel`,
    taskRunSchema,
    {
      method: "POST",
      body: cancelTaskRunInputSchema.parse(input),
    },
  );
}

export async function listActiveTaskRuns(): Promise<TaskRun[]> {
  return requestJson<TaskRun[]>("/api/tasks/runs/active", taskRunListSchema);
}

export async function listTaskSchedulerState(): Promise<TaskSchedulerState[]> {
  return requestJson<TaskSchedulerState[]>(
    "/api/tasks/scheduler/state",
    taskSchedulerStateListSchema,
  );
}
