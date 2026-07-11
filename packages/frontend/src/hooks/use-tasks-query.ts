import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type {
  CancelTaskRunInput,
  AddArtifactInput,
  CreateTaskFeedbackInput,
  CreateTaskInput,
  CreateTaskRunFollowupInput,
  CreateTaskTemplateInput,
  ListTasksQuery,
  QueueTaskInput,
  Task,
  TaskFeedbackThread,
  TaskRunFollowup,
  TaskTemplateRunNowInput,
  CreateArtifactShareLinkInput,
  UpdateTaskContextInput,
  UpdateTaskFeedbackInput,
  UpdateTaskInput,
  UpdateTaskTemplateInput,
  UploadTaskContextAttachmentInput,
} from "@cc/shared/schemas";

import {
  acceptTask,
  addConversationArtifact,
  archiveTask,
  cancelTaskRun,
  createArtifactShareLink,
  createRunFollowup,
  createTask,
  createTaskFeedback,
  createTaskFromTemplate,
  createTaskTemplate,
  disableTaskTemplate,
  enableTaskTemplate,
  deleteTask,
  disableTask,
  duplicateTask,
  enableTask,
  getTask,
  getTaskTemplate,
  getTaskRun,
  inspectTaskRunSession,
  listRunFollowups,
  listConversationArtifacts,
  listArchivedTasks,
  listActiveTaskRuns,
  listTaskTemplateTasks,
  listTaskSchedulerState,
  listTaskTemplates,
  listTaskRuns,
  listTaskFeedback,
  listTaskSubtaskProgress,
  listTaskSubtasks,
  listTasks,
  openTaskRunInChat,
  previewTaskQueue,
  queueTask,
  restoreTask,
  revokeArtifactShareLink,
  runTaskTemplateNow,
  updateTask,
  updateTaskContext,
  updateTaskFeedback,
  updateTaskTemplate,
  uploadTaskContextAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useTasksQuery(
  query: Partial<ListTasksQuery> = {},
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: queryKeys.tasks(query),
    queryFn: () => listTasks(query),
    refetchInterval: options.refetchInterval,
  });
}

export function useArchivedTasksQuery() {
  return useQuery({
    queryKey: queryKeys.taskArchive,
    queryFn: listArchivedTasks,
  });
}

export function useTaskTemplatesQuery() {
  return useQuery({
    queryKey: queryKeys.taskTemplates,
    queryFn: listTaskTemplates,
  });
}

export function useTaskTemplateQuery(templateId?: string) {
  return useQuery({
    queryKey: queryKeys.taskTemplate(templateId ?? "missing"),
    queryFn: () => getTaskTemplate(templateId ?? ""),
    enabled: Boolean(templateId),
  });
}

export function useTaskTemplateTasksQuery(templateId?: string) {
  return useQuery({
    queryKey: queryKeys.taskTemplateTasks(templateId ?? "missing"),
    queryFn: () => listTaskTemplateTasks(templateId ?? ""),
    enabled: Boolean(templateId),
  });
}

export function useTaskQuery(taskId?: string) {
  return useQuery({
    queryKey: queryKeys.task(taskId ?? "missing"),
    queryFn: () => getTask(taskId ?? ""),
    enabled: Boolean(taskId),
  });
}

export function useTaskRunsQuery(taskId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRuns(taskId ?? "missing"),
    queryFn: () => listTaskRuns(taskId ?? ""),
    enabled: Boolean(taskId),
  });
}

export function useTaskFeedbackQuery(taskId?: string) {
  return useQuery({
    queryKey: queryKeys.taskFeedback(taskId ?? "missing"),
    queryFn: () => listTaskFeedback(taskId ?? ""),
    enabled: Boolean(taskId),
  });
}

export function useTaskSubtasksQuery(taskId?: string) {
  return useQuery({
    queryKey: queryKeys.taskSubtasks(taskId ?? "missing"),
    queryFn: () => listTaskSubtasks(taskId ?? ""),
    enabled: Boolean(taskId),
  });
}

export function useTaskSubtaskProgressQuery(taskIds: string[]) {
  return useQuery({
    queryKey: queryKeys.taskSubtaskProgress(taskIds),
    queryFn: () => listTaskSubtaskProgress(taskIds),
    enabled: taskIds.length > 0,
  });
}

export function useTaskRunQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRun(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => getTaskRun(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId),
  });
}

export function useTaskRunFollowupsQuery(
  taskId?: string,
  runId?: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.taskRunFollowups(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => listRunFollowups(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId && (options.enabled ?? true)),
    refetchInterval: (query) =>
      query.state.data?.some((followup) => followup.status === "sending") ? 5_000 : false,
  });
}

export function useTaskRunSessionQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRunSession(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => inspectTaskRunSession(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId),
  });
}

export function useConversationArtifactsQuery(
  conversationId?: string,
  options: { refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: queryKeys.conversationArtifacts(conversationId ?? "missing"),
    queryFn: () => listConversationArtifacts(conversationId ?? ""),
    enabled: Boolean(conversationId),
    refetchInterval: options.refetchInterval,
  });
}

export function useActiveTaskRunsQuery() {
  return useQuery({
    queryKey: queryKeys.activeTaskRuns,
    queryFn: () => listActiveTaskRuns(),
    refetchInterval: 10_000,
  });
}

export function useTaskSchedulerStateQuery() {
  return useQuery({
    queryKey: queryKeys.taskSchedulerState,
    queryFn: listTaskSchedulerState,
  });
}

export function useTaskMutations() {
  const queryClient = useQueryClient();
  const invalidateTasks = async (task?: Task) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskArchive }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskSchedulerState }),
      task ? queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) }) : undefined,
      task ? queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(task.id) }) : undefined,
    ]);
  };
  const invalidateRunFollowups = async (taskId: string, runId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskRun(taskId, runId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskRunFollowups(taskId, runId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtasks(taskId) }),
      queryClient.invalidateQueries({ queryKey: ["task-subtask-progress"] }),
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    ]);
  };

  return {
    create: useMutation({
      mutationFn: (input: CreateTaskInput) => createTask(input),
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await invalidateTasks(task);
      },
    }),
    createTemplate: useMutation({
      mutationFn: (input: CreateTaskTemplateInput) => createTaskTemplate(input),
      onSuccess: async (template) => {
        queryClient.setQueryData(queryKeys.taskTemplate(template.id), template);
        await queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates });
      },
    }),
    updateTemplate: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTaskTemplateInput }) =>
        updateTaskTemplate(id, input),
      onSuccess: async (template) => {
        queryClient.setQueryData(queryKeys.taskTemplate(template.id), template);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplate(template.id) }),
        ]);
      },
    }),
    enableTemplate: useMutation({
      mutationFn: (id: string) => enableTaskTemplate(id),
      onSuccess: async (template) => {
        queryClient.setQueryData(queryKeys.taskTemplate(template.id), template);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplate(template.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskSchedulerState }),
        ]);
      },
    }),
    disableTemplate: useMutation({
      mutationFn: (id: string) => disableTaskTemplate(id),
      onSuccess: async (template) => {
        queryClient.setQueryData(queryKeys.taskTemplate(template.id), template);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplate(template.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskSchedulerState }),
        ]);
      },
    }),
    createFromTemplate: useMutation({
      mutationFn: (id: string) => createTaskFromTemplate(id),
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
          task.sourceTemplateId
            ? queryClient.invalidateQueries({
                queryKey: queryKeys.taskTemplateTasks(task.sourceTemplateId),
              })
            : undefined,
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      },
    }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => updateTask(id, input),
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await invalidateTasks(task);
      },
    }),
    updateContext: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTaskContextInput }) =>
        updateTaskContext(id, input),
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await invalidateTasks(task);
      },
    }),
    uploadContextAttachment: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UploadTaskContextAttachmentInput }) =>
        uploadTaskContextAttachment(id, input),
      onSuccess: async (_result, variables) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.task(variables.id) }),
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      },
    }),
    createFeedback: useMutation({
      mutationFn: ({ id, input }: { id: string; input: CreateTaskFeedbackInput }) =>
        createTaskFeedback(id, input),
      onSuccess: async (feedback, variables) => {
        queryClient.setQueryData<TaskFeedbackThread[]>(
          queryKeys.taskFeedback(variables.id),
          (current = []) => {
            const withoutDuplicate = current.filter((entry) => entry.id !== feedback.id);
            return [...withoutDuplicate, feedback];
          },
        );

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtasks(variables.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(feedback.taskId) }),
          queryClient.invalidateQueries({ queryKey: ["task-subtask-progress"] }),
        ]);
      },
    }),
    updateFeedback: useMutation({
      mutationFn: ({
        taskId,
        feedbackId,
        input,
      }: {
        taskId: string;
        feedbackId: string;
        input: UpdateTaskFeedbackInput;
      }) => updateTaskFeedback(taskId, feedbackId, input),
      onSuccess: async (feedback, variables) => {
        queryClient.setQueryData<TaskFeedbackThread[]>(
          queryKeys.taskFeedback(variables.taskId),
          (current = []) => current.map((entry) => (entry.id === feedback.id ? feedback : entry)),
        );

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskSubtasks(variables.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(feedback.taskId) }),
          queryClient.invalidateQueries({ queryKey: ["task-subtask-progress"] }),
        ]);
      },
    }),
    duplicate: useMutation({
      mutationFn: duplicateTask,
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await invalidateTasks(task);
      },
    }),
    archive: useMutation({ mutationFn: archiveTask, onSuccess: invalidateTasks }),
    accept: useMutation({ mutationFn: acceptTask, onSuccess: invalidateTasks }),
    restore: useMutation({ mutationFn: restoreTask, onSuccess: invalidateTasks }),
    enable: useMutation({ mutationFn: enableTask, onSuccess: invalidateTasks }),
    disable: useMutation({ mutationFn: disableTask, onSuccess: invalidateTasks }),
    remove: useMutation({
      mutationFn: deleteTask,
      onSuccess: async () => invalidateTasks(),
    }),
    trigger: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input?: Partial<Omit<QueueTaskInput, "taskId">>;
      }) => queueTask(id, { triggerSource: "manual", ...input }),
      onSuccess: async (run) => {
        queryClient.setQueryData(queryKeys.taskRun(run.taskId, run.id), run);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.task(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskSchedulerState }),
          queryClient.invalidateQueries({ queryKey: ["task-subtask-progress"] }),
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      },
    }),
    createRunFollowup: useMutation({
      mutationFn: ({
        taskId,
        runId,
        input,
      }: {
        taskId: string;
        runId: string;
        input: CreateTaskRunFollowupInput;
      }) => createRunFollowup(taskId, runId, input),
      onSuccess: async (followup, variables) => {
        queryClient.setQueryData<TaskRunFollowup[]>(
          queryKeys.taskRunFollowups(variables.taskId, variables.runId),
          (current = []) => [...current.filter((entry) => entry.id !== followup.id), followup],
        );
        await invalidateRunFollowups(variables.taskId, variables.runId);
      },
    }),
    previewQueue: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: string;
        input?: Partial<Omit<QueueTaskInput, "taskId">>;
      }) => previewTaskQueue(id, { triggerSource: "manual", ...input }),
    }),
    runTemplateNow: useMutation({
      mutationFn: ({ id, input }: { id: string; input?: TaskTemplateRunNowInput }) =>
        runTaskTemplateNow(id, input),
      onSuccess: async (run, variables) => {
        queryClient.setQueryData(queryKeys.taskRun(run.taskId, run.id), run);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplates }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplate(variables.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskTemplateTasks(variables.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.task(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }),
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      },
    }),
    cancelRun: useMutation({
      mutationFn: ({
        taskId,
        runId,
        input,
      }: {
        taskId: string;
        runId: string;
        input?: CancelTaskRunInput;
      }) => cancelTaskRun(taskId, runId, input),
      onSuccess: async (run) => {
        queryClient.setQueryData(queryKeys.taskRun(run.taskId, run.id), run);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.task(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(run.taskId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }),
          queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        ]);
      },
    }),
    openInChat: useMutation({
      mutationFn: ({ taskId, runId }: { taskId: string; runId: string }) =>
        openTaskRunInChat(taskId, runId),
      onSuccess: async (_snapshot, variables) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(variables.taskId) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskRunSession(variables.taskId, variables.runId),
          }),
        ]);
      },
    }),
    addConversationArtifact: useMutation({
      mutationFn: ({
        conversationId,
        input,
      }: {
        conversationId: string;
        input: AddArtifactInput;
      }) => addConversationArtifact(conversationId, input),
      onSuccess: async (_artifact, variables) => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.conversationArtifacts(variables.conversationId),
        });
      },
    }),
    createArtifactShareLink: useMutation({
      mutationFn: ({
        artifactId,
        input,
      }: {
        artifactId: string;
        conversationId?: string;
        taskId?: string;
        input?: CreateArtifactShareLinkInput;
      }) => createArtifactShareLink(artifactId, input),
      onSuccess: async (_result, variables) => {
        await invalidateArtifactContainers(queryClient, variables);
      },
    }),
    revokeArtifactShareLink: useMutation({
      mutationFn: ({
        artifactId,
        shareId,
      }: {
        artifactId: string;
        conversationId?: string;
        taskId?: string;
        shareId: string;
      }) => revokeArtifactShareLink(artifactId, shareId),
      onSuccess: async (_result, variables) => {
        await invalidateArtifactContainers(queryClient, variables);
      },
    }),
  };
}

// A share-link change updates the artifact's inline shareLinks; refresh whichever
// queries surface that artifact (the chat conversation panel and/or the task's
// runs).
async function invalidateArtifactContainers(
  queryClient: QueryClient,
  variables: { conversationId?: string; taskId?: string },
): Promise<void> {
  const invalidations: Promise<unknown>[] = [];
  if (variables.conversationId) {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversationArtifacts(variables.conversationId),
      }),
    );
  }
  if (variables.taskId) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: queryKeys.task(variables.taskId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(variables.taskId) }),
    );
  }
  invalidations.push(queryClient.invalidateQueries({ queryKey: queryKeys.activeTaskRuns }));
  await Promise.all(invalidations);
}
