import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Task,
  TaskFeedbackThread,
  TaskRun,
  TaskRunFollowup,
  TaskTemplate,
} from "@cc/shared/schemas";

vi.mock("@/lib/api", () => ({
  acceptTask: vi.fn(),
  archiveTask: vi.fn(),
  cancelTaskRun: vi.fn(),
  createTask: vi.fn(),
  createTaskFeedback: vi.fn(),
  createRunFollowup: vi.fn(),
  createTaskFromTemplate: vi.fn(),
  createTaskTemplate: vi.fn(),
  createTaskArtifactShareLink: vi.fn(),
  deleteTask: vi.fn(),
  disableTask: vi.fn(),
  duplicateTask: vi.fn(),
  enableTask: vi.fn(),
  getTask: vi.fn(),
  getTaskTemplate: vi.fn(),
  getTaskRun: vi.fn(),
  inspectTaskRunSession: vi.fn(),
  listActiveTaskRuns: vi.fn(),
  listArchivedTasks: vi.fn(),
  listRunFollowups: vi.fn(),
  listTaskRunArtifacts: vi.fn(),
  listTaskFeedback: vi.fn(),
  listTaskRuns: vi.fn(),
  listTaskSchedulerState: vi.fn(),
  listTaskSubtaskProgress: vi.fn(),
  listTaskSubtasks: vi.fn(),
  listTaskTemplateTasks: vi.fn(),
  listTaskTemplates: vi.fn(),
  listTasks: vi.fn(),
  openTaskRunInChat: vi.fn(),
  previewTaskQueue: vi.fn(),
  queueTask: vi.fn(),
  restoreTask: vi.fn(),
  revokeTaskArtifactShareLink: vi.fn(),
  runTaskTemplateNow: vi.fn(),
  updateTask: vi.fn(),
  updateTaskContext: vi.fn(),
  updateTaskFeedback: vi.fn(),
  updateTaskTemplate: vi.fn(),
  uploadTaskContextAttachment: vi.fn(),
}));

import {
  acceptTask,
  archiveTask,
  cancelTaskRun,
  createTask,
  createTaskFeedback,
  createRunFollowup,
  createTaskFromTemplate,
  createTaskTemplate,
  createTaskArtifactShareLink,
  deleteTask,
  disableTask,
  duplicateTask,
  enableTask,
  getTask,
  getTaskTemplate,
  getTaskRun,
  inspectTaskRunSession,
  listActiveTaskRuns,
  listArchivedTasks,
  listRunFollowups,
  listTaskRunArtifacts,
  listTaskFeedback,
  listTaskRuns,
  listTaskSchedulerState,
  listTaskSubtaskProgress,
  listTaskSubtasks,
  listTaskTemplateTasks,
  listTaskTemplates,
  listTasks,
  openTaskRunInChat,
  previewTaskQueue,
  queueTask,
  restoreTask,
  revokeTaskArtifactShareLink,
  runTaskTemplateNow,
  updateTask,
  updateTaskContext,
  updateTaskFeedback,
  updateTaskTemplate,
  uploadTaskContextAttachment,
} from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

import {
  useActiveTaskRunsQuery,
  useArchivedTasksQuery,
  useTaskFeedbackQuery,
  useTaskMutations,
  useTaskQuery,
  useTaskRunQuery,
  useTaskRunFollowupsQuery,
  useTaskRunArtifactsQuery,
  useTaskRunSessionQuery,
  useTaskRunsQuery,
  useTaskSchedulerStateQuery,
  useTaskSubtaskProgressQuery,
  useTaskSubtasksQuery,
  useTaskTemplateQuery,
  useTaskTemplateTasksQuery,
  useTaskTemplatesQuery,
  useTasksQuery,
} from "./use-tasks-query";

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    agentId: "agent-1",
    fallbackModels: [],
    title: "Ship release",
    description: "Prepare release notes.",
    context: { attachments: [] },
    todos: [],
    status: "backlog",
    enabled: true,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: "template-1",
    defaultAgentId: "agent-1",
    fallbackModels: [],
    title: "Weekly release notes",
    description: "Draft release notes.",
    todos: [],
    recurrence: undefined,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    id: "run-1",
    taskId: "task-1",
    agentId: "agent-1",
    fallbackModels: [],
    status: "queued",
    triggerSource: "manual",
    renderedPrompt: "Do the task.",
    artifacts: [],
    needsHumanReview: false,
    hasActiveReply: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeFollowup(overrides: Partial<TaskRunFollowup> = {}): TaskRunFollowup {
  return {
    id: "followup-1",
    taskId: "task-1",
    runId: "run-1",
    kind: "operator_reply",
    status: "sending",
    body: "Please continue.",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("use task queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads task query data through their API wrappers", async () => {
    vi.mocked(listTasks).mockResolvedValue([makeTask()]);
    vi.mocked(listArchivedTasks).mockResolvedValue([makeTask({ id: "archived" })]);
    vi.mocked(listTaskTemplates).mockResolvedValue([makeTemplate()]);
    vi.mocked(getTaskTemplate).mockResolvedValue(makeTemplate({ id: "template-2" }));
    vi.mocked(listTaskTemplateTasks).mockResolvedValue([makeTask({ id: "generated" })]);
    vi.mocked(getTask).mockResolvedValue(makeTask({ id: "task-2" }));
    vi.mocked(listTaskRuns).mockResolvedValue([makeRun()]);
    vi.mocked(getTaskRun).mockResolvedValue(makeRun({ id: "run-2" }));
    vi.mocked(inspectTaskRunSession).mockResolvedValue({
      run: makeRun({ id: "run-2" }),
      conversation: {
        id: "conv-1",
        agentId: "agent-1",
        opencodeSessionId: "session-1",
        title: "Task run",
        status: "active",
        source: "task_run",
        isCurrent: true,
        messageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        messages: [],
      },
      diagnostics: [],
      canOpenInChat: true,
    });
    vi.mocked(listTaskFeedback).mockResolvedValue([
      {
        id: "feedback-1",
        taskId: "task-1",
        body: "Retest.",
        targetAgentIds: ["agent-1"],
        subtasks: [],
        createdAt: "2026-01-01T00:00:00.000Z",
      } satisfies TaskFeedbackThread,
    ]);
    vi.mocked(listTaskSubtasks).mockResolvedValue([]);
    vi.mocked(listTaskSubtaskProgress).mockResolvedValue([]);
    vi.mocked(listActiveTaskRuns).mockResolvedValue([makeRun({ id: "active-run" })]);
    vi.mocked(listRunFollowups).mockResolvedValue([makeFollowup()]);
    vi.mocked(listTaskSchedulerState).mockResolvedValue([]);

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => ({
        tasks: useTasksQuery({ status: "backlog" }).data,
        archive: useArchivedTasksQuery().data,
        templates: useTaskTemplatesQuery().data,
        template: useTaskTemplateQuery("template-2").data,
        templateTasks: useTaskTemplateTasksQuery("template-2").data,
        task: useTaskQuery("task-2").data,
        runs: useTaskRunsQuery("task-1").data,
        run: useTaskRunQuery("task-1", "run-2").data,
        followups: useTaskRunFollowupsQuery("task-1", "run-1").data,
        session: useTaskRunSessionQuery("task-1", "run-2").data,
        feedback: useTaskFeedbackQuery("task-1").data,
        subtasks: useTaskSubtasksQuery("task-1").data,
        progress: useTaskSubtaskProgressQuery(["task-1"]).data,
        activeRuns: useActiveTaskRunsQuery().data,
        scheduler: useTaskSchedulerStateQuery().data,
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.tasks?.[0]?.id).toBe("task-1");
      expect(result.current.activeRuns?.[0]?.id).toBe("active-run");
    });

    expect(listTasks).toHaveBeenCalledWith({ status: "backlog" });
    expect(result.current.archive?.[0]?.id).toBe("archived");
    expect(result.current.templates?.[0]?.id).toBe("template-1");
    expect(result.current.template?.id).toBe("template-2");
    expect(result.current.templateTasks?.[0]?.id).toBe("generated");
    expect(result.current.task?.id).toBe("task-2");
    expect(result.current.runs?.[0]?.id).toBe("run-1");
    expect(result.current.run?.id).toBe("run-2");
    expect(result.current.followups?.[0]?.id).toBe("followup-1");
    expect(result.current.session?.conversation?.id).toBe("conv-1");
    expect(result.current.feedback?.[0]?.id).toBe("feedback-1");
    expect(result.current.subtasks).toEqual([]);
    expect(result.current.progress).toEqual([]);
    expect(result.current.scheduler).toEqual([]);
  });

  it("does not run optional id queries until ids are available", () => {
    const queryClient = createQueryClient();

    renderHook(
      () => ({
        template: useTaskTemplateQuery(undefined),
        templateTasks: useTaskTemplateTasksQuery(undefined),
        task: useTaskQuery(undefined),
        runs: useTaskRunsQuery(undefined),
        run: useTaskRunQuery(undefined, "run-1"),
        followups: useTaskRunFollowupsQuery("task-1", undefined),
        disabledFollowups: useTaskRunFollowupsQuery("task-1", "run-1", { enabled: false }),
        session: useTaskRunSessionQuery("task-1", undefined),
        feedback: useTaskFeedbackQuery(undefined),
        subtasks: useTaskSubtasksQuery(undefined),
        progress: useTaskSubtaskProgressQuery([]),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    expect(getTaskTemplate).not.toHaveBeenCalled();
    expect(listTaskTemplateTasks).not.toHaveBeenCalled();
    expect(getTask).not.toHaveBeenCalled();
    expect(listTaskRuns).not.toHaveBeenCalled();
    expect(getTaskRun).not.toHaveBeenCalled();
    expect(listRunFollowups).not.toHaveBeenCalled();
    expect(inspectTaskRunSession).not.toHaveBeenCalled();
    expect(listTaskFeedback).not.toHaveBeenCalled();
    expect(listTaskSubtasks).not.toHaveBeenCalled();
    expect(listTaskSubtaskProgress).not.toHaveBeenCalled();
  });
});

describe("useTaskMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates query cache and invalidates task views for core mutations", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const created = makeTask({ id: "created" });
    const updated = makeTask({ id: "updated" });
    vi.mocked(createTask).mockResolvedValue(created);
    vi.mocked(updateTask).mockResolvedValue(updated);
    vi.mocked(updateTaskContext).mockResolvedValue(updated);
    vi.mocked(duplicateTask).mockResolvedValue(makeTask({ id: "duplicate" }));
    vi.mocked(archiveTask).mockResolvedValue(makeTask({ id: "archived" }));
    vi.mocked(acceptTask).mockResolvedValue(makeTask({ id: "accepted" }));
    vi.mocked(restoreTask).mockResolvedValue(makeTask({ id: "restored" }));
    vi.mocked(enableTask).mockResolvedValue(makeTask({ id: "enabled" }));
    vi.mocked(disableTask).mockResolvedValue(makeTask({ id: "disabled" }));
    vi.mocked(deleteTask).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTaskMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.create.mutateAsync({ agentId: "agent-1", title: "Create" });
      await result.current.update.mutateAsync({ id: "updated", input: { title: "Updated" } });
      await result.current.updateContext.mutateAsync({ id: "updated", input: { attachments: [] } });
      await result.current.duplicate.mutateAsync("task-1");
      await result.current.archive.mutateAsync("task-1");
      await result.current.accept.mutateAsync("task-1");
      await result.current.restore.mutateAsync("task-1");
      await result.current.enable.mutateAsync("task-1");
      await result.current.disable.mutateAsync("task-1");
      await result.current.remove.mutateAsync("task-1");
    });

    expect(queryClient.getQueryData(queryKeys.task("created"))).toEqual(created);
    expect(queryClient.getQueryData(queryKeys.task("updated"))).toEqual(updated);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    expect(vi.mocked(deleteTask).mock.calls[0]?.[0]).toBe("task-1");
  });

  it("creates and revokes artifact share links, invalidating the artifacts query", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    vi.mocked(createTaskArtifactShareLink).mockResolvedValue({
      shareId: "share-1",
      url: "https://example.com/share/abc",
      expiresAt: null,
    });
    vi.mocked(revokeTaskArtifactShareLink).mockResolvedValue(undefined);

    const { result } = renderHook(() => useTaskMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createArtifactShareLink.mutateAsync({
        taskId: "task-1",
        runId: "run-1",
        artifactId: "art-1",
        input: { expiresInMinutes: 60 },
      });
      await result.current.revokeArtifactShareLink.mutateAsync({
        taskId: "task-1",
        runId: "run-1",
        artifactId: "art-1",
        shareId: "share-1",
      });
    });

    expect(createTaskArtifactShareLink).toHaveBeenCalledWith("task-1", "run-1", "art-1", {
      expiresInMinutes: 60,
    });
    expect(revokeTaskArtifactShareLink).toHaveBeenCalledWith("task-1", "run-1", "art-1", "share-1");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.taskRunArtifacts("task-1", "run-1"),
    });
  });

  it("loads task run artifacts through useTaskRunArtifactsQuery", async () => {
    const queryClient = createQueryClient();
    vi.mocked(listTaskRunArtifacts).mockResolvedValue({
      artifacts: [
        {
          id: "art-1",
          taskId: "task-1",
          runId: "run-1",
          title: "Report",
          originalFilename: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 10,
          checksum: "abc",
          storageKey: "key",
          createdAt: "2026-01-01T00:00:00.000Z",
          shareLinks: [],
        },
      ],
    });

    const { result } = renderHook(() => useTaskRunArtifactsQuery("task-1", "run-1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listTaskRunArtifacts).toHaveBeenCalledWith("task-1", "run-1");
    expect(result.current.data?.artifacts).toHaveLength(1);
  });

  it("disables the artifacts query when ids are missing", () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => useTaskRunArtifactsQuery(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(listTaskRunArtifacts).not.toHaveBeenCalled();
  });

  it("updates followup cache and invalidates run views when a reply is sent", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const created = makeFollowup({ id: "followup-created", body: "First reply." });

    vi.mocked(createRunFollowup).mockResolvedValue(created);

    const { result } = renderHook(() => useTaskMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createRunFollowup.mutateAsync({
        taskId: "task-1",
        runId: "run-1",
        input: { body: "First reply." },
      });
    });

    expect(createRunFollowup).toHaveBeenCalledWith("task-1", "run-1", { body: "First reply." });
    expect(queryClient.getQueryData(queryKeys.taskRunFollowups("task-1", "run-1"))).toEqual([
      created,
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.taskRunFollowups("task-1", "run-1"),
    });
  });

  it("updates feedback cache and invalidates subtask views for feedback edits", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const original: TaskFeedbackThread = {
      id: "feedback-1",
      taskId: "task-1",
      body: "Old feedback.",
      targetAgentIds: ["agent-1"],
      subtasks: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const updated: TaskFeedbackThread = {
      ...original,
      body: "Updated feedback.",
    };

    queryClient.setQueryData(queryKeys.taskFeedback("task-1"), [original]);
    vi.mocked(updateTaskFeedback).mockResolvedValue(updated);

    const { result } = renderHook(() => useTaskMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateFeedback.mutateAsync({
        taskId: "task-1",
        feedbackId: "feedback-1",
        input: { body: "Updated feedback." },
      });
    });

    expect(updateTaskFeedback).toHaveBeenCalledWith("task-1", "feedback-1", {
      body: "Updated feedback.",
    });
    expect(queryClient.getQueryData(queryKeys.taskFeedback("task-1"))).toEqual([updated]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.taskSubtasks("task-1"),
    });
  });

  it("updates template, feedback, run, and attachment caches", async () => {
    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const template = makeTemplate({ id: "template-1" });
    const generated = makeTask({ id: "generated", sourceTemplateId: "template-1" });
    const run = makeRun({ id: "run-1", taskId: "task-1" });
    const feedback: TaskFeedbackThread = {
      id: "feedback-1",
      taskId: "task-1",
      body: "Retest.",
      targetAgentIds: ["agent-1"],
      subtasks: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    vi.mocked(createTaskTemplate).mockResolvedValue(template);
    vi.mocked(updateTaskTemplate).mockResolvedValue(template);
    vi.mocked(createTaskFromTemplate).mockResolvedValue(generated);
    vi.mocked(uploadTaskContextAttachment).mockResolvedValue({
      attachment: {
        id: "attachment-1",
        filename: "plan.md",
        mimeType: "text/markdown",
        sizeBytes: 4,
        storageKey: ".cc/tasks/task-1/context/plan.md",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      context: {
        attachments: [
          {
            id: "attachment-1",
            filename: "plan.md",
            mimeType: "text/markdown",
            sizeBytes: 4,
            storageKey: ".cc/tasks/task-1/context/plan.md",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    vi.mocked(createTaskFeedback).mockResolvedValue(feedback);
    vi.mocked(queueTask).mockResolvedValue(run);
    vi.mocked(previewTaskQueue).mockResolvedValue({
      taskId: "task-1",
      runAgentId: "agent-1",
      renderedPrompt: "Do the task.",
      renderedContext: {},
    });
    vi.mocked(runTaskTemplateNow).mockResolvedValue(run);
    vi.mocked(cancelTaskRun).mockResolvedValue(
      makeRun({ id: "run-cancelled", status: "cancelled" }),
    );
    vi.mocked(openTaskRunInChat).mockResolvedValue({
      current: {
        id: "conv-1",
        agentId: "agent-1",
        opencodeSessionId: "session-1",
        title: "Task run",
        status: "active",
        source: "task_run",
        isCurrent: true,
        messageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        messages: [],
      },
      previous: [],
    });

    const { result } = renderHook(() => useTaskMutations(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createTemplate.mutateAsync({
        defaultAgentId: "agent-1",
        title: "Template",
      });
      await result.current.updateTemplate.mutateAsync({
        id: "template-1",
        input: { title: "Template" },
      });
      await result.current.createFromTemplate.mutateAsync("template-1");
      await result.current.uploadContextAttachment.mutateAsync({
        id: "task-1",
        input: {
          filename: "plan.md",
          mimeType: "text/markdown",
          dataUrl: "data:text/markdown;base64,cGxhbg==",
          sizeBytes: 4,
        },
      });
      await result.current.createFeedback.mutateAsync({
        id: "task-1",
        input: { body: "Retest." },
      });
      await result.current.trigger.mutateAsync({ id: "task-1" });
      await result.current.previewQueue.mutateAsync({ id: "task-1" });
      await result.current.runTemplateNow.mutateAsync({ id: "template-1" });
      await result.current.cancelRun.mutateAsync({ taskId: "task-1", runId: "run-1" });
      await result.current.openInChat.mutateAsync({ taskId: "task-1", runId: "run-1" });
    });

    expect(queryClient.getQueryData(queryKeys.taskTemplate("template-1"))).toEqual(template);
    expect(queryClient.getQueryData(queryKeys.task("generated"))).toEqual(generated);
    expect(queryClient.getQueryData(queryKeys.taskRun("task-1", "run-1"))).toEqual(run);
    expect(queryClient.getQueryData(queryKeys.taskFeedback("task-1"))).toEqual([feedback]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.taskTemplates });
  });
});
