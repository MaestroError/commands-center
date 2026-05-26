import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  CreateTaskInput,
  ListTasksQuery,
  Task,
  TriggerTaskInput,
  UpdateTaskInput,
} from "@cc/shared/schemas";

import {
  archiveTask,
  createTask,
  deleteTask,
  disableTask,
  duplicateTask,
  enableTask,
  getTask,
  getTaskRun,
  inspectTaskRunSession,
  listArchivedTasks,
  listActiveTaskRuns,
  listTaskTemplates,
  listTaskRuns,
  listTasks,
  openTaskRunInChat,
  queueTask,
  restoreTask,
  updateTask,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export function useTasksQuery(query: Partial<ListTasksQuery> = {}) {
  return useQuery({
    queryKey: queryKeys.tasks(query),
    queryFn: () => listTasks(query),
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

export function useTaskRunQuery(taskId?: string, runId?: string) {
  return useQuery({
    queryKey: queryKeys.taskRun(taskId ?? "missing", runId ?? "missing"),
    queryFn: () => getTaskRun(taskId ?? "", runId ?? ""),
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

export function useActiveTaskRunsQuery() {
  return useQuery({
    queryKey: queryKeys.activeTaskRuns,
    queryFn: () => listActiveTaskRuns(),
    refetchInterval: 10_000,
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
      task ? queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) }) : undefined,
      task ? queryClient.invalidateQueries({ queryKey: queryKeys.taskRuns(task.id) }) : undefined,
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
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => updateTask(id, input),
      onSuccess: async (task) => {
        queryClient.setQueryData(queryKeys.task(task.id), task);
        await invalidateTasks(task);
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
    restore: useMutation({ mutationFn: restoreTask, onSuccess: invalidateTasks }),
    enable: useMutation({ mutationFn: enableTask, onSuccess: invalidateTasks }),
    disable: useMutation({ mutationFn: disableTask, onSuccess: invalidateTasks }),
    remove: useMutation({
      mutationFn: deleteTask,
      onSuccess: async () => invalidateTasks(),
    }),
    trigger: useMutation({
      mutationFn: ({ id, input }: { id: string; input?: Partial<TriggerTaskInput> }) =>
        queueTask(id, { triggerSource: "manual", ...input }),
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
  };
}
