import type {
  Specialist,
  SpecialistCatalog,
  Task,
  TaskFeedbackThread,
  TaskRun,
  TaskRunSessionInspection,
  TaskSubtaskProgress,
  TaskTemplate,
} from "@cc/shared/schemas";

import { expect, test, type Page, type Route } from "../fixtures";

export { expect, test, type Page, type Route };

/**
 * In-memory backend state for the task-domain e2e suite. Each test starts from a
 * fresh `createTaskState()` and installs `mockTaskApi(page, state)`, which serves the
 * task/agent endpoints the Tasks pages touch and mutates this state in place so that
 * follow-up reads (after react-query invalidation) reflect the change.
 */
export type TaskState = {
  agents: Specialist[];
  catalog: SpecialistCatalog;
  tasks: Task[];
  archivedTasks: Task[];
  templates: TaskTemplate[];
  templateTasks: Task[];
  runsByTaskId: Record<string, TaskRun[]>;
  feedbackByTaskId: Record<string, TaskFeedbackThread[]>;
  session: TaskRunSessionInspection;
  subtaskProgress: TaskSubtaskProgress[];
  activeRuns: TaskRun[];
};

const NOW = "2026-01-01T00:00:00.000Z";

const plannerAgent: Specialist = {
  id: "agent-1",
  slug: "planner",
  name: "Planner",
  role: "Plans work",
  instructions: "Plan carefully.",
  defaultModel: "openai/gpt-4.1",
  workspacePath: "/tmp/planner",
  status: "active",
  capabilities: {
    builtInSkills: [],
    workspaceSkills: [],
    customTools: [],
    mcpServers: [],
    toolPermissions: [],
    appMcpServers: [],
    appToolPermissions: [],
  },
  createdAt: NOW,
  updatedAt: NOW,
};

const reviewerAgent: Specialist = {
  ...plannerAgent,
  id: "agent-2",
  slug: "reviewer",
  name: "Reviewer",
  workspacePath: "/tmp/reviewer",
};

const catalog: SpecialistCatalog = {
  builtInSkills: [
    {
      name: "Code reviewer",
      slug: "code-reviewer",
      description: "Review code changes for bugs and style issues.",
      category: "quality",
      metadata: {},
      detailsMarkdown: "Review code changes.",
      files: [],
    },
  ],
  workspaceSkills: [],
  providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
  mcpServers: [],
  appMcpServers: [],
  customTools: [],
};

function baseTask(overrides: Partial<Task> & Pick<Task, "id" | "title" | "status">): Task {
  return {
    agentId: "agent-1",
    fallbackModels: [],
    description: "Prepare release notes.",
    context: { attachments: [] },
    todos: [],
    enabled: true,
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const completedRun: TaskRun = {
  id: "run-1",
  taskId: "task-ready",
  agentId: "agent-1",
  fallbackModels: [],
  opencodeSessionId: "session-1",
  status: "completed",
  triggerSource: "manual",
  renderedPrompt: "Task: Ship release",
  context: { text: "Use changelog." },
  renderedContext: { taskTitle: "Ship release" },
  effectivePermissions: { toolPermissions: [{ pattern: "bash_*", action: "allow" }] },
  finalMessage: "Release notes drafted.",
  resultText: "Saved release notes to `notes.md`.",
  artifacts: [
    {
      id: "artifact-notes",
      conversationId: "conv-release",
      title: "Notes",
      type: "file",
      link: "notes.md",
      description: "Generated release notes.",
      createdAt: NOW,
      shareLinks: [],
    },
  ],
  needsHumanReview: true,
  humanReviewReason: "Confirm the generated notes are complete.",
  hasActiveReply: false,
  result: { messageCount: 3 },
  createdAt: NOW,
  updatedAt: NOW,
};

const session: TaskRunSessionInspection = {
  run: completedRun,
  canOpenInChat: false,
  diagnostics: [],
  conversation: {
    id: "conv-1",
    agentId: "agent-1",
    opencodeSessionId: "session-1",
    title: "Ship release",
    status: "active",
    source: "task_run",
    isCurrent: false,
    taskId: "task-ready",
    taskRunId: "run-1",
    messageCount: 2,
    createdAt: NOW,
    updatedAt: NOW,
    messages: [
      {
        id: "msg-1",
        conversationId: "conv-1",
        role: "user",
        content: "Task: Ship release",
        parts: [],
        attachments: [],
        createdAt: NOW,
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
      {
        id: "msg-2",
        conversationId: "conv-1",
        role: "assistant",
        content: "Release notes drafted.",
        parts: [],
        attachments: [],
        createdAt: "2026-01-01T00:02:00.000Z",
        updatedAt: "2026-01-01T00:02:00.000Z",
      },
    ],
  },
};

const recurringTemplate: TaskTemplate = {
  id: "template-1",
  defaultAgentId: "agent-1",
  fallbackModels: [],
  title: "Weekly release notes",
  description: "Generate release note draft every week.",
  todos: [],
  recurrence: {
    mode: "recurring",
    anchorAt: NOW,
    timezone: "UTC",
    repeatRule: { frequency: "week", interval: 1, weekdays: [1] },
  },
  enabled: true,
  latestTaskId: "task-backlog",
  nextOccurrenceAt: "2026-01-08T00:00:00.000Z",
  createdAt: NOW,
  updatedAt: NOW,
};

const manualTemplate: TaskTemplate = {
  ...recurringTemplate,
  id: "template-manual",
  title: "Reusable release checklist",
  description: "On-demand release checklist.",
  recurrence: undefined,
  latestTaskId: undefined,
  nextOccurrenceAt: undefined,
};

export function createTaskState(): TaskState {
  return {
    agents: [structuredClone(plannerAgent), structuredClone(reviewerAgent)],
    catalog: structuredClone(catalog),
    tasks: [
      baseTask({
        id: "task-backlog",
        title: "Ship release",
        status: "backlog",
        latestFinalMessage: "Ready to publish.",
      }),
      baseTask({
        id: "task-ready",
        title: "Draft changelog",
        status: "ready_to_check",
        latestRunId: "run-1",
        latestFinalMessage: "Release notes drafted.",
      }),
      baseTask({
        id: "task-done",
        title: "Tag previous release",
        status: "done",
      }),
    ],
    archivedTasks: [
      baseTask({
        id: "task-archived",
        title: "Archived release",
        status: "archived",
        archived: true,
        archivedAt: "2026-01-08T00:00:00.000Z",
      }),
    ],
    templates: [structuredClone(recurringTemplate), structuredClone(manualTemplate)],
    templateTasks: [
      baseTask({
        id: "task-backlog",
        title: "Ship release",
        status: "backlog",
        sourceTemplateId: "template-1",
        sourceOccurrenceAt: NOW,
      }),
    ],
    runsByTaskId: { "task-ready": [structuredClone(completedRun)] },
    feedbackByTaskId: {},
    session: structuredClone(session),
    subtaskProgress: [],
    activeRuns: [],
  };
}

function json(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function notFound() {
  return json({ error: { message: "not found" } }, 404);
}

/**
 * Installs route handlers for the specialist + task endpoints the Tasks pages depend on.
 * A single broad handler owns every `/api/tasks*` path and branches on method +
 * pathname, mutating `state` so re-fetches observe writes.
 */
export async function mockTaskApi(page: Page, state: TaskState): Promise<void> {
  await page.route("**/api/mcp-servers", (route: Route) => route.fulfill(json([])));
  await page.route("**/api/custom-tools", (route: Route) => route.fulfill(json([])));
  await page.route("**/api/workspace-skills", (route: Route) => route.fulfill(json([])));
  await page.route("**/api/providers", (route: Route) =>
    route.fulfill(
      json([
        {
          provider: {
            id: "openai",
            name: "OpenAI",
            source: "env",
            env: ["OPENAI_API_KEY"],
            models: {},
          },
          connected: false,
          authMethods: [{ type: "api", label: "API key", prompts: [] }],
          models: [{ id: "openai/gpt-4.1", name: "gpt-4.1", providerId: "openai" }],
        },
      ]),
    ),
  );
  await page.route("**/api/documents/tree", (route: Route) => route.fulfill(json({ tree: [] })));

  await page.route("**/api/specialists**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;

    if (path === "/api/specialists/catalog") {
      return route.fulfill(json(state.catalog));
    }

    if (path === "/api/specialists") {
      return route.fulfill(json(state.agents.filter((agent) => agent.status === "active")));
    }

    if (path.startsWith("/api/specialists/by-slug/")) {
      const slug = decodeURIComponent(path.split("/").pop() ?? "");
      const agent = state.agents.find((entry) => entry.slug === slug);
      return route.fulfill(agent ? json(agent) : notFound());
    }

    const id = decodeURIComponent(path.split("/").pop() ?? "");
    const agent = state.agents.find((entry) => entry.id === id);
    return route.fulfill(agent ? json(agent) : notFound());
  });

  await page.route("**/api/tasks**", (route: Route) => handleTaskRoute(route, state));
}

function handleTaskRoute(route: Route, state: TaskState) {
  const request = route.request();
  const method = request.method();
  const path = new URL(request.url()).pathname;
  const body = (): Record<string, unknown> => {
    const raw = request.postData();
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // The backend stores a cleared/empty model as "no model" and never echoes
    // null back, so mirror that here — otherwise merging the raw body would put
    // `model: null` on the response, which the Task/Template schema rejects.
    if (parsed["model"] === null) {
      delete parsed["model"];
    }
    return parsed;
  };

  // Collection + fixed sub-collections.
  if (path === "/api/tasks") {
    if (method === "POST") {
      const created = baseTask({
        id: `task-new-${state.tasks.length + 1}`,
        title: (body()["title"] as string) ?? "New task",
        status: "backlog",
      });
      state.tasks.push(created);
      return route.fulfill(json(created, 201));
    }
    return route.fulfill(json(state.tasks.filter((task) => !task.archived)));
  }
  if (path === "/api/tasks/archive") return route.fulfill(json(state.archivedTasks));
  if (path === "/api/tasks/runs/active") return route.fulfill(json(state.activeRuns));
  if (path === "/api/tasks/scheduler/state") return route.fulfill(json([]));
  if (path === "/api/tasks/subtask-progress") return route.fulfill(json(state.subtaskProgress));

  // Templates.
  if (path === "/api/tasks/templates") {
    if (method === "POST") {
      const created: TaskTemplate = {
        ...manualTemplate,
        id: `template-new-${state.templates.length + 1}`,
        title: (body()["title"] as string) ?? "New template",
        description: (body()["description"] as string) ?? "",
        recurrence: undefined,
        latestTaskId: undefined,
        nextOccurrenceAt: undefined,
      };
      state.templates.push(created);
      return route.fulfill(json(created, 201));
    }
    return route.fulfill(json(state.templates));
  }

  const templateMatch = path.match(/^\/api\/tasks\/templates\/([^/]+)(?:\/(tasks|run-now))?$/);
  if (templateMatch) {
    const [, rawId, sub] = templateMatch;
    const id = decodeURIComponent(rawId ?? "");
    const template = state.templates.find((entry) => entry.id === id);

    if (sub === "run-now" && method === "POST") {
      const run: TaskRun = { ...completedRun, id: `run-now-${id}`, taskId: "task-backlog" };
      return route.fulfill(json(run, 201));
    }
    if (sub === "tasks") {
      if (method === "POST") {
        const created = baseTask({
          id: `task-from-${id}`,
          title: template?.title ?? "Generated task",
          status: "backlog",
          sourceTemplateId: id,
        });
        state.tasks.push(created);
        return route.fulfill(json(created, 201));
      }
      return route.fulfill(json(state.templateTasks.filter((t) => t.sourceTemplateId === id)));
    }
    if (!template) return route.fulfill(notFound());
    if (method === "PATCH") {
      Object.assign(template, body(), { updatedAt: bumpTime(template.updatedAt) });
      return route.fulfill(json(template));
    }
    if (method === "DELETE") {
      state.templates = state.templates.filter((entry) => entry.id !== id);
      return route.fulfill(json({ ok: true }));
    }
    return route.fulfill(json(template));
  }

  // Single task + sub-resources.
  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)(?:\/(.*))?$/);
  if (!taskMatch) return route.fulfill(notFound());
  const [, rawId, sub] = taskMatch;
  const id = decodeURIComponent(rawId ?? "");
  const task = state.tasks.find((entry) => entry.id === id);

  if (sub === "runs") {
    return route.fulfill(json(state.runsByTaskId[id] ?? []));
  }
  const runMatch = sub?.match(/^runs\/([^/]+)(?:\/(session|cancel|followups))?$/);
  if (runMatch) {
    const [, runId, runSub] = runMatch;
    const run = (state.runsByTaskId[id] ?? []).find((entry) => entry.id === runId);
    if (runSub === "cancel" && method === "POST") {
      if (!run) return route.fulfill(notFound());
      run.status = "cancelled";
      state.activeRuns = state.activeRuns.filter((entry) => entry.id !== run.id);
      const taskToCancel = state.tasks.find((entry) => entry.id === id);
      if (taskToCancel) {
        taskToCancel.status = "failed";
      }
      return route.fulfill(json(run));
    }
    if (runSub === "followups") {
      return route.fulfill(json([]));
    }
    if (runSub === "session") {
      return route.fulfill(json({ ...state.session, run: run ?? state.session.run }));
    }
    return route.fulfill(run ? json(run) : notFound());
  }
  if (sub === "feedback") {
    if (method === "POST") {
      const thread: TaskFeedbackThread = {
        id: `feedback-${(state.feedbackByTaskId[id]?.length ?? 0) + 1}`,
        taskId: id,
        body: (body()["body"] as string) ?? "",
        targetAgentIds: (body()["mentionedAgentIds"] as string[]) ?? [],
        subtasks: [],
        createdAt: NOW,
      };
      state.feedbackByTaskId[id] = [...(state.feedbackByTaskId[id] ?? []), thread];
      return route.fulfill(json(thread, 201));
    }
    return route.fulfill(json(state.feedbackByTaskId[id] ?? []));
  }
  if (sub === "subtasks") return route.fulfill(json([]));
  if (sub === "queue/preview" && method === "POST") {
    return route.fulfill(
      json({ taskId: id, renderedPrompt: "Task: preview", renderedContext: {} }),
    );
  }

  // Deleting a template is issued as `DELETE /api/tasks/{templateId}` by the UI, so
  // accept the id whether it names a task or a template and drop it from both.
  if (!sub && method === "DELETE") {
    state.tasks = state.tasks.filter((entry) => entry.id !== id);
    state.archivedTasks = state.archivedTasks.filter((entry) => entry.id !== id);
    state.templates = state.templates.filter((entry) => entry.id !== id);
    return route.fulfill(json({ ok: true }));
  }

  const archivedTask = state.archivedTasks.find((entry) => entry.id === id);
  if (!task && !(archivedTask && sub === "restore" && method === "POST")) {
    return route.fulfill(notFound());
  }

  if (archivedTask && sub === "restore" && method === "POST") {
    archivedTask.archived = false;
    delete archivedTask.archivedAt;
    archivedTask.status = "backlog";
    state.archivedTasks = state.archivedTasks.filter((entry) => entry.id !== id);
    state.tasks.push(archivedTask);
    return route.fulfill(json(archivedTask));
  }

  if (!task) return route.fulfill(notFound());

  if (sub === "queue" && method === "POST") {
    task.status = "queued";
    task.updatedAt = bumpTime(task.updatedAt);
    const run: TaskRun = { ...completedRun, id: `run-queue-${id}`, taskId: id, status: "running" };
    return route.fulfill(json(run, 201));
  }
  if (sub === "accept" && method === "POST") {
    task.status = "done";
    return route.fulfill(json(task));
  }
  if (sub === "archive" && method === "POST") {
    task.archived = true;
    task.status = "archived";
    task.archivedAt = bumpTime(task.updatedAt);
    state.tasks = state.tasks.filter((entry) => entry.id !== id);
    state.archivedTasks.push(task);
    return route.fulfill(json(task));
  }
  if (sub === "restore" && method === "POST") {
    task.archived = false;
    task.status = "backlog";
    return route.fulfill(json(task));
  }
  if (sub === "duplicate" && method === "POST") {
    const copy = baseTask({ ...task, id: `${id}-copy`, title: `${task.title} (copy)` });
    state.tasks.push(copy);
    return route.fulfill(json(copy, 201));
  }

  if (!sub) {
    if (method === "PATCH") {
      Object.assign(task, body(), { updatedAt: bumpTime(task.updatedAt) });
      return route.fulfill(json(task));
    }
    return route.fulfill(json(task));
  }

  return route.fulfill(notFound());
}

function bumpTime(iso: string): string {
  return new Date(Date.parse(iso) + 1000).toISOString();
}

/**
 * The board uses native HTML5 drag-and-drop (`draggable` + `dataTransfer`), which
 * Playwright's mouse-based `dragTo` does not trigger. This dispatches the synthetic
 * drag sequence with a single shared DataTransfer so the board's handlers fire.
 */
export async function dragCard(
  page: Page,
  cardTestId: string,
  columnTestId: string,
): Promise<void> {
  await page.evaluate(
    ({ cardTestId, columnTestId }) => {
      const card = document.querySelector(`[data-testid="${cardTestId}"]`);
      const column = document.querySelector(`[data-testid="${columnTestId}"]`);
      if (!card || !column) {
        throw new Error(`drag source/target missing: ${cardTestId} -> ${columnTestId}`);
      }
      const dataTransfer = new DataTransfer();
      const fire = (target: Element, type: string) =>
        target.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
        );
      fire(card, "dragstart");
      fire(column, "dragenter");
      fire(column, "dragover");
      fire(column, "drop");
      fire(card, "dragend");
    },
    { cardTestId, columnTestId },
  );
}
