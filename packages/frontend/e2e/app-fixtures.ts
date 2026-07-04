import type {
  ChatEvent,
  ConversationDetail,
  ConversationPart,
  ConversationSnapshot,
  ConversationSummary,
  FileManagerNode,
  OwnerAuthStatus,
  Specialist,
  SpecialistCatalog,
} from "@cc/shared/schemas";

import type { Page, Route } from "./fixtures";

const NOW = "2026-01-01T00:00:00.000Z";

export const e2eSpecialist: Specialist = {
  id: "agent-chat",
  slug: "planner",
  name: "Planner",
  role: "Plans workspace work",
  instructions: "Plan carefully.",
  defaultModel: "openai/gpt-4.1",
  workspacePath: "/workspace/specialists/planner",
  status: "active",
  capabilities: {
    builtInSkills: ["code-reviewer"],
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

export const e2eCatalog: SpecialistCatalog = {
  builtInSkills: [
    {
      name: "Code reviewer",
      slug: "code-reviewer",
      description: "Review code changes.",
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

type ChatMockState = {
  current: ConversationDetail;
  previous: ConversationSummary[];
  events: ChatEvent[];
  promptStatus?: number;
  promptError?: string;
};

export function createChatState(overrides: Partial<ChatMockState> = {}): ChatMockState {
  const current = conversationDetail("conv-current", "Current chat", [
    message("msg-user-1", "user", "Draft a release note."),
    message("msg-assistant-1", "assistant", "I can help draft the release note.", [
      { id: "part-existing-1", type: "text", text: "I can help draft the release note." },
    ]),
  ]);
  const previousDetail = conversationDetail("conv-previous", "Previous chat", [
    message("msg-previous-1", "user", "Summarize yesterday."),
    message("msg-previous-2", "assistant", "Previous chat summary is ready.", [
      { id: "part-previous-1", type: "text", text: "Previous chat summary is ready." },
    ]),
  ]);

  return {
    current,
    previous: [summary(previousDetail)],
    events: [],
    ...overrides,
  };
}

export async function mockChatApi(page: Page, state: ChatMockState): Promise<void> {
  if (state.events.length > 0) {
    state.current = applyChatEvents(state.current, state.events);
  }

  await mockCommonAppApis(page);
  await mockSpecialistApis(page);
  await mockWorkspaceApis(page);
  await mockDocumentApis(page);
  await mockProviderApis(page);

  await page.route("**/api/specialists/agent-chat/conversations**", (route: Route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/active")) {
      const snapshot: ConversationSnapshot = { current: state.current, previous: state.previous };
      return route.fulfill(jsonResponse(snapshot));
    }

    if (path.endsWith("/start-fresh")) {
      const next = conversationDetail("conv-fresh", "Fresh chat", []);
      state.current = next;
      state.previous = [summary(conversationDetail("conv-current", "Current chat", []))];
      return route.fulfill(jsonResponse({ current: next, previous: state.previous }));
    }

    if (path.endsWith("/conversations")) {
      return route.fulfill(jsonResponse([summary(state.current), ...state.previous]));
    }

    const conversationId = decodeURIComponent(path.split("/").pop() ?? "");
    const detail =
      conversationId === state.current.id
        ? state.current
        : conversationDetail(conversationId, "Previous chat", [
            message("msg-previous-1", "user", "Summarize yesterday."),
            message("msg-previous-2", "assistant", "Previous chat summary is ready.", [
              { id: "part-previous-1", type: "text", text: "Previous chat summary is ready." },
            ]),
          ]);
    return route.fulfill(jsonResponse(detail));
  });

  await page.route("**/api/conversations/*/media", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/conversations/*/artifacts", (route: Route) => {
    return route.fulfill(jsonResponse({ artifacts: [] }));
  });

  await page.route("**/api/conversations/*/system-prompts", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/conversations/*/events", (route: Route) => {
    return route.fulfill(sseResponse(state.events));
  });

  await page.route("**/api/conversations/*/prompt?stream=true", async (route: Route) => {
    if (state.promptStatus && state.promptStatus >= 400) {
      await route.fulfill(
        jsonResponse(
          { error: { message: state.promptError ?? "Prompt failed." } },
          state.promptStatus,
        ),
      );
      return;
    }

    await route.fulfill({ status: 204, body: "" });
  });
}

export async function mockSidebarSmokeApis(page: Page): Promise<void> {
  await mockCommonAppApis(page);
  await mockSpecialistApis(page);
  await mockWorkspaceApis(page);
  await mockDocumentApis(page);
  await mockFileManagerApis(page);
  await mockSettingsApis(page);

  await page.route("**/api/api-tokens", (route: Route) => {
    if (route.request().method() === "POST") {
      return route.fulfill(
        jsonResponse({
          token: "cc_test_token",
          record: {
            id: "token-1",
            name: "E2E token",
            tokenPrefix: "cc_test",
            scopes: ["tasks"],
            createdAt: Date.now(),
            lastUsedAt: null,
            revokedAt: null,
          },
        }),
      );
    }
    return route.fulfill(jsonResponse({ tokens: [] }));
  });

  await mockProviderApis(page);
}

export async function mockAuthFlowApis(
  page: Page,
  initialStatus: OwnerAuthStatus = "unclaimed",
): Promise<void> {
  let status: OwnerAuthStatus = initialStatus;

  await page.route("**/api/auth/status", (route: Route) => {
    return route.fulfill(jsonResponse({ status }));
  });

  await page.route("**/api/auth/claim", (route: Route) => {
    status = "claimed-authenticated";
    return route.fulfill(jsonResponse({ status }));
  });

  await page.route("**/api/auth/login", (route: Route) => {
    status = "claimed-authenticated";
    return route.fulfill(jsonResponse({ status }));
  });

  await mockCommonAppApis(page);
  await mockDocumentApis(page);
}

export async function mockCommonAppApis(page: Page): Promise<void> {
  await page.route("**/api/system/version", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        current: "1.0.0",
        latest: "1.0.0",
        updateAvailable: false,
        installMode: "npm-global",
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
        checkedAt: NOW,
      }),
    );
  });

  await page.route("**/api/system/update-preferences", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        autoUpdateEnabled: false,
        autoUpdateSource: "environment",
        environmentDefault: false,
      }),
    );
  });

  await page.route("**/api/opencode", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        state: "healthy",
        healthy: true,
        url: "http://127.0.0.1:4096",
        workspaceDir: "/workspace",
        version: "1.0.0",
        binarySource: "dependency",
        restartCount: 0,
        maxRestarts: 3,
      }),
    );
  });

  await page.route("**/api/tasks/runs/active", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/activities*", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        activities: [
          {
            id: "activity-1",
            kind: "task_completed",
            level: "info",
            status: "pending",
            title: "Workspace ready",
            body: "CommandsCenter is ready for work.",
            payload: {},
            createdAt: NOW,
            updatedAt: NOW,
            archivedAt: null,
          },
        ],
        actionRequiredCount: 0,
      }),
    );
  });
}

function conversationDetail(
  id: string,
  title: string,
  messages: ConversationDetail["messages"],
): ConversationDetail {
  return {
    id,
    agentId: e2eSpecialist.id,
    opencodeSessionId: `session-${id}`,
    title,
    status: "active",
    source: "chat",
    isCurrent: id === "conv-current",
    messageCount: messages.length,
    createdAt: NOW,
    updatedAt: NOW,
    messages,
  };
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  parts: ConversationDetail["messages"][number]["parts"] = [],
): ConversationDetail["messages"][number] {
  return {
    id,
    conversationId: "conv-current",
    role,
    content,
    parts,
    attachments: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function summary(detail: ConversationDetail): ConversationSummary {
  return {
    id: detail.id,
    agentId: detail.agentId,
    opencodeSessionId: detail.opencodeSessionId,
    title: detail.title,
    status: detail.status,
    source: detail.source,
    isCurrent: detail.isCurrent,
    taskId: detail.taskId,
    taskRunId: detail.taskRunId,
    messageCount: detail.messageCount,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    convertedAt: detail.convertedAt,
  };
}

function applyChatEvents(detail: ConversationDetail, events: ChatEvent[]): ConversationDetail {
  const next = structuredClone(detail);
  const partsByMessage = new Map(next.messages.map((entry) => [entry.id, entry.parts]));

  for (const event of events) {
    if (event.type === "message.updated") {
      const incoming = {
        ...event.properties.message,
        conversationId: event.properties.message.conversationId || next.id,
      };
      const existingIndex = next.messages.findIndex((entry) => entry.id === incoming.id);
      if (existingIndex >= 0) {
        next.messages[existingIndex] = {
          ...next.messages[existingIndex]!,
          ...incoming,
          parts: next.messages[existingIndex]!.parts,
        };
      } else {
        next.messages.push(incoming);
        partsByMessage.set(incoming.id, incoming.parts);
      }
      continue;
    }

    if (event.type === "message.part.updated") {
      const parts = partsByMessage.get(event.properties.messageID) ?? [];
      const updated = upsertPart(parts, event.properties.part);
      partsByMessage.set(event.properties.messageID, updated);
      updateMessageParts(next, event.properties.messageID, updated);
      continue;
    }

    if (event.type === "message.part.delta") {
      const parts = partsByMessage.get(event.properties.messageID) ?? [];
      const updated = parts.map((part) => {
        if (part.id !== event.properties.partID) {
          return part;
        }

        const record = part as ConversationPart & Record<string, unknown>;
        const existing = record[event.properties.field];
        const current = typeof existing === "string" ? existing : "";
        return { ...part, [event.properties.field]: `${current}${event.properties.delta}` };
      });
      partsByMessage.set(event.properties.messageID, updated);
      updateMessageParts(next, event.properties.messageID, updated);
    }
  }

  next.messageCount = next.messages.length;
  return next;
}

function upsertPart(parts: ConversationPart[], part: ConversationPart): ConversationPart[] {
  const index = parts.findIndex((entry) => entry.id === part.id);
  if (index < 0) {
    return [...parts, part];
  }

  return parts.map((entry) => (entry.id === part.id ? part : entry));
}

function updateMessageParts(
  detail: ConversationDetail,
  messageId: string,
  parts: ConversationPart[],
): void {
  detail.messages = detail.messages.map((entry) =>
    entry.id === messageId ? { ...entry, parts } : entry,
  );
}

async function mockSpecialistApis(page: Page): Promise<void> {
  await page.route("**/api/specialists/catalog", (route: Route) => {
    return route.fulfill(jsonResponse(e2eCatalog));
  });

  await page.route("**/api/specialists/by-slug/planner", (route: Route) => {
    return route.fulfill(jsonResponse(e2eSpecialist));
  });

  await page.route("**/api/specialists", (route: Route) => {
    return route.fulfill(jsonResponse([e2eSpecialist]));
  });

  await page.route("**/api/mcp-servers", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/custom-tools", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/workspace-skills", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/secrets", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });
}

async function mockWorkspaceApis(page: Page): Promise<void> {
  await page.route("**/api/search/files*", (route: Route) => {
    return route.fulfill(jsonResponse({ files: [] }));
  });

  await page.route("**/api/specialists/*/workspace/events", (route: Route) => {
    return route.fulfill(sseResponse([{ type: "heartbeat", properties: {} }]));
  });

  await page.route("**/api/specialists/*/workspace/file*", (route: Route) => {
    return route.fulfill(
      jsonResponse([
        {
          name: "README.md",
          path: "README.md",
          absolute: "/workspace/README.md",
          type: "file",
          ignored: false,
        },
      ]),
    );
  });

  await page.route("**/api/specialists/*/workspace/find/file*", (route: Route) => {
    return route.fulfill(jsonResponse([]));
  });
}

async function mockProviderApis(page: Page): Promise<void> {
  await page.route("**/api/providers", (route: Route) => {
    return route.fulfill(
      jsonResponse([
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
    );
  });
}

async function mockDocumentApis(page: Page): Promise<void> {
  await page.route("**/api/documents/tree", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        tree: [
          {
            name: "Guides",
            relativePath: "Guides",
            type: "directory",
            title: null,
            children: [
              {
                name: "Overview.md",
                relativePath: "Guides/Overview.md",
                type: "file",
                title: "Overview",
              },
            ],
          },
        ],
      }),
    );
  });

  await page.route("**/api/documents/file*", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        relativePath: "Guides/Overview.md",
        fullPath: "/workspace/Documents/Guides/Overview.md",
        title: "Overview",
        description: "Workspace guide.",
        author: "CommandsCenter",
        content: "# Overview\n\nWorkspace guide.",
        revision: { mtimeMs: 1, sizeBytes: 28, sha256: "doc-sha" },
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  });
}

async function mockFileManagerApis(page: Page): Promise<void> {
  const nodes: FileManagerNode[] = [
    {
      name: "README.md",
      path: "README.md",
      absolutePath: "/workspace/README.md",
      type: "file",
      sizeBytes: 42,
      lineCount: 2,
      isCritical: false,
    },
    {
      name: "src",
      path: "src",
      absolutePath: "/workspace/src",
      type: "directory",
      isCritical: false,
    },
  ];

  await page.route("**/api/file-manager/nodes*", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        root: "workspace",
        currentPath: ".",
        absolutePath: "/workspace",
        nodes,
      }),
    );
  });

  await page.route("**/api/file-manager/files/content*", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        root: "workspace",
        path: "README.md",
        absolutePath: "/workspace/README.md",
        name: "README.md",
        kind: "text",
        content: "# CommandsCenter",
        revision: { mtimeMs: 1, sizeBytes: 16, sha256: "file-sha" },
        isWritable: true,
      }),
    );
  });

  await page.route("**/api/file-manager/preferences", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        allowHostFilesystemEdits: false,
        fileUploads: { maxUploadSizeBytes: 52428800, allowDangerousFiles: false },
      }),
    );
  });
}

async function mockSettingsApis(page: Page): Promise<void> {
  await page.route("**/api/tasks/artifact-sharing/preferences", (route: Route) => {
    return route.fulfill(jsonResponse({ taskArtifactSignedUrlExpiresInMinutes: 60 }));
  });

  await page.route("**/api/task-run-monitor/settings", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        taskRunMonitorMaxLifetimeMinutes: 360,
        taskRunMonitorNoProgressTimeoutMinutes: 30,
        taskRunMonitorRequeueAfterStall: false,
        taskRunMonitorRequeueLimit: 10,
        taskRunMaxAutoRetries: 10,
      }),
    );
  });

  await page.route("**/api/system-prompts", (route: Route) => {
    return route.fulfill(
      jsonResponse({
        prompts: [
          {
            id: "global-chat",
            title: "Global chat",
            description: "Base chat instructions.",
            scope: "chat",
            order: 1,
            optional: false,
            danger: false,
            enabledByDefault: true,
            variables: [],
            isCustomized: false,
          },
        ],
        variables: [],
      }),
    );
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function sseResponse(events: unknown[]) {
  return {
    status: 200,
    contentType: "text/event-stream",
    body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  };
}
