import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CancelTaskRunInput,
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
  CreateTaskArtifactShareLinkInput,
  UpdateTaskContextInput,
  UpdateTaskFeedbackInput,
  UpdateTaskInput,
  UpdateTaskRunFollowupInput,
  UpdateTaskTemplateInput,
  UploadTaskContextAttachmentInput,
} from "@cc/shared/schemas";

import {
  acceptTask,
  archiveTask,
  cancelTaskRun,
  continueRun,
  createTaskArtifactShareLink,
  createRunFollowup,
  createTask,
  createTaskFeedback,
  createTaskFromTemplate,
  createTaskTemplate,
  disableTaskTemplate,
  enableTaskTemplate,
  deleteTask,
  deleteRunFollowup,
  disableTask,
  duplicateTask,
  enableTask,
  getTask,
  getTaskTemplate,
  getTaskRun,
  inspectTaskRunSession,
  listRunFollowups,
  listTaskRunArtifacts,
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
  revokeTaskArtifactShareLink,
  runTaskTemplateNow,
  updateRunFollowup,
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

export function useTaskRunFollowupsQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRunFollowups(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => listRunFollowups(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId),
  });
}

export function useTaskRunSessionQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRunSession(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => inspectTaskRunSession(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId),
  });
}

export function useTaskRunArtifactsQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRunArtifacts(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => listTaskRunArtifacts(taskId ?? "", runId ?? ""),
    enabled: Boolean(taskId && runId),
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
    updateRunFollowup: useMutation({
      mutationFn: ({
        taskId,
        runId,
        followupId,
        input,
      }: {
        taskId: string;
        runId: string;
        followupId: string;
        input: UpdateTaskRunFollowupInput;
      }) => updateRunFollowup(taskId, runId, followupId, input),
      onSuccess: async (followup, variables) => {
        queryClient.setQueryData<TaskRunFollowup[]>(
          queryKeys.taskRunFollowups(variables.taskId, variables.runId),
          (current = []) => current.map((entry) => (entry.id === followup.id ? followup : entry)),
        );
        await invalidateRunFollowups(variables.taskId, variables.runId);
      },
    }),
    deleteRunFollowup: useMutation({
      mutationFn: ({
        taskId,
        runId,
        followupId,
      }: {
        taskId: string;
        runId: string;
        followupId: string;
      }) => deleteRunFollowup(taskId, runId, followupId),
      onSuccess: async (_result, variables) => {
        queryClient.setQueryData<TaskRunFollowup[]>(
          queryKeys.taskRunFollowups(variables.taskId, variables.runId),
          (current = []) => current.filter((entry) => entry.id !== variables.followupId),
        );
        await invalidateRunFollowups(variables.taskId, variables.runId);
      },
    }),
    continueRun: useMutation({
      mutationFn: ({ taskId, runId }: { taskId: string; runId: string }) =>
        continueRun(taskId, runId),
      onSuccess: async (run) => {
        queryClient.setQueryData(queryKeys.taskRun(run.taskId, run.id), run);
        await invalidateRunFollowups(run.taskId, run.id);
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
    createArtifactShareLink: useMutation({
      mutationFn: ({
        taskId,
        runId,
        artifactId,
        input,
      }: {
        taskId: string;
        runId: string;
        artifactId: string;
        input?: CreateTaskArtifactShareLinkInput;
      }) => createTaskArtifactShareLink(taskId, runId, artifactId, input),
      onSuccess: async (_result, variables) => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.taskRunArtifacts(variables.taskId, variables.runId),
        });
      },
    }),
    revokeArtifactShareLink: useMutation({
      mutationFn: ({
        taskId,
        runId,
        artifactId,
        shareId,
      }: {
        taskId: string;
        runId: string;
        artifactId: string;
        shareId: string;
      }) => revokeTaskArtifactShareLink(taskId, runId, artifactId, shareId),
      onSuccess: async (_result, variables) => {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.taskRunArtifacts(variables.taskId, variables.runId),
        });
      },
    }),
  };
}
