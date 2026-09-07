import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FileSaveConflictError,
  McpEngineRestartRequiredError,
  WorkspaceSkillUploadRenameError,
  abortConversation,
  buildFileManagerDownloadHref,
  buildFileManagerZipDownloadHref,
  archiveActivity,
  archiveAllActivities,
  unarchiveActivity,
  archiveSpecialist,
  archiveTask,
  acceptTask,
  activateMcpServer,
  authenticateMcp,
  closeTerminalSession,
  copySpecialistCustomToolToGlobal,
  createCustomTool,
  createDocument,
  createDocumentFolder,
  createFileManagerEntry,
  createMcpServer,
  createSpecialist,
  createTerminalSession,
  createWorkspaceSkill,
  deleteConversation,
  deleteCustomTool,
  deleteFileManagerEntry,
  deleteMcpServer,
  deleteSecret,
  deleteSpecialistCustomTool,
  deleteTask,
  deleteWorkspaceSkill,
  disableTask,
  disableTaskTemplate,
  disconnectProvider,
  enableTask,
  enableTaskTemplate,
  fetchConversationMedia,
  fillSecret,
  getActiveConversation,
  getConversation,
  getConversationSystemPrompts,
  getDocumentContent,
  getFileManagerFileContent,
  getFileManagerPreferences,
  getSpecialistBySlug,
  getSystemPrompt,
  getSystemPrompts,
  getSystemUpdatePreferences,
  getTaskRunMonitorSettings,
  listConversations,
  listFileManagerNodes,
  listSecrets,
  listTasks,
  listTerminalSessions,
  moveFileManagerEntry,
  moveSpecialistCustomToolToGlobal,
  refreshMcpServers,
  rejectQuestion,
  renameFileManagerEntry,
  replyPermission,
  replyQuestion,
  resetSystemPrompt,
  resizeTerminalSession,
  resolveLiveRequest,
  restoreTask,
  revokeApiToken,
  revokeArtifactShareLink,
  saveDocumentContent,
  saveFileManagerFileContent,
  saveSystemPrompt,
  searchFileManagerDirectories,
  sendCommand,
  sendPrompt,
  sendShell,
  setConversationSystemPromptEnabled,
  setMcpServerEnabled,
  setSecret,
  startFreshConversation,
  startMcpAuth,
  startProviderOauth,
  completeProviderOauth,
  submitProviderApiKey,
  summarizeConversation,
  updateDocumentMetadata,
  updateFileManagerPreferences,
  updateMcpServer,
  updateSpecialist,
  updateSystemUpdatePreferences,
  updateTaskArtifactSharingPreferences,
  updateTaskRunMonitorSettings,
  uploadFileManagerEntries,
  uploadTaskContextAttachment,
  uploadWorkspaceSkill,
  updateWorkspaceSkillCategory,
} from "./api";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/** Stub fetch to always resolve with an error payload so wrappers reject via readApiError. */
function stubError(
  status = 500,
  statusText = "Server Error",
  body: unknown = { error: { message: "boom" } },
) {
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(jsonResponse(body, { status, statusText }));
  return spy;
}

/** Stub fetch to resolve 204 so void wrappers hit their success branch. */
function stubNoContent() {
  const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
  return spy;
}

afterEach(() => {
  document.cookie = "cc_csrf_token=; Max-Age=0; path=/";
  vi.restoreAllMocks();
});

const fileRevision = { mtimeMs: 1, sizeBytes: 2 };
const stdioConfig = { transport: "stdio" as const, command: ["node"], environment: {} };

type Case = {
  name: string;
  run: () => Promise<unknown>;
  url: string;
  method?: string;
};

// Wrappers built on requestJson: on an error response they read the JSON payload
// and throw readApiError(). Asserting rejection covers the wrapper body + the
// error-formatting path, while the fetch assertion pins the URL and method.
const requestJsonCases: Case[] = [
  {
    name: "getSystemUpdatePreferences",
    run: () => getSystemUpdatePreferences(),
    url: "/api/system/update-preferences",
  },
  {
    name: "updateSystemUpdatePreferences",
    run: () => updateSystemUpdatePreferences({ autoUpdateEnabled: true }),
    url: "/api/system/update-preferences",
    method: "PUT",
  },
  {
    name: "getTaskRunMonitorSettings",
    run: () => getTaskRunMonitorSettings(),
    url: "/api/task-run-monitor/settings",
  },
  {
    name: "updateTaskRunMonitorSettings",
    run: () => updateTaskRunMonitorSettings({} as never),
    url: "/api/task-run-monitor/settings",
    method: "PUT",
  },
  {
    name: "updateTaskArtifactSharingPreferences",
    run: () => updateTaskArtifactSharingPreferences({ taskArtifactSignedUrlExpiresInMinutes: 60 }),
    url: "/api/tasks/artifact-sharing/preferences",
    method: "PUT",
  },
  {
    name: "refreshMcpServers",
    run: () => refreshMcpServers(),
    url: "/api/mcp-servers/refresh",
    method: "POST",
  },
  {
    name: "createMcpServer",
    run: () => createMcpServer({ name: "srv", enabled: true, config: stdioConfig }),
    url: "/api/mcp-servers",
    method: "POST",
  },
  {
    name: "updateMcpServer",
    run: () => updateMcpServer("srv-1", { name: "srv", config: stdioConfig }),
    url: "/api/mcp-servers/srv-1",
    method: "PATCH",
  },
  {
    name: "setMcpServerEnabled",
    run: () => setMcpServerEnabled("srv-1", false),
    url: "/api/mcp-servers/srv-1/enabled",
    method: "PATCH",
  },
  {
    name: "startMcpAuth",
    run: () => startMcpAuth("srv-1"),
    url: "/api/mcp-servers/srv-1/auth/start",
    method: "POST",
  },
  {
    name: "authenticateMcp",
    run: () => authenticateMcp("srv-1"),
    url: "/api/mcp-servers/srv-1/auth/authenticate",
    method: "POST",
  },
  { name: "listSecrets", run: () => listSecrets(), url: "/api/secrets" },
  {
    name: "resolveLiveRequest",
    run: () => resolveLiveRequest("conv-1", "req-1", { action: "submit", values: {} }),
    url: "/api/conversations/conv-1/live-requests/req-1/resolve",
    method: "POST",
  },
  {
    name: "getDocumentContent",
    run: () => getDocumentContent("notes.md"),
    url: "/api/documents/file?path=notes.md",
  },
  {
    name: "createDocument",
    run: () => createDocument({ path: "folder/notes.md", content: "# hi" }),
    url: "/api/documents",
    method: "POST",
  },
  {
    name: "createDocumentFolder",
    run: () => createDocumentFolder({ path: "folder" }),
    url: "/api/documents/folders",
    method: "POST",
  },
  {
    name: "updateDocumentMetadata",
    run: () => updateDocumentMetadata({ path: "notes.md", title: "Notes" }),
    url: "/api/documents/metadata",
    method: "PATCH",
  },
  {
    name: "saveDocumentContent",
    run: () =>
      saveDocumentContent({ path: "notes.md", content: "x", expectedRevision: fileRevision }),
    url: "/api/documents/content",
    method: "PUT",
  },
  {
    name: "getSpecialistBySlug",
    run: () => getSpecialistBySlug("helper"),
    url: "/api/specialists/by-slug/helper",
  },
  {
    name: "createCustomTool",
    run: () => createCustomTool({ name: "Tool", description: "" }),
    url: "/api/custom-tools",
    method: "POST",
  },
  {
    name: "createWorkspaceSkill",
    run: () => createWorkspaceSkill({ name: "Skill", description: "does things" }),
    url: "/api/workspace-skills",
    method: "POST",
  },
  {
    name: "copySpecialistCustomToolToGlobal",
    run: () => copySpecialistCustomToolToGlobal("agent-1", "tool-1", { overwrite: false }),
    url: "/api/specialists/agent-1/custom-tools/tool-1/copy-to-global",
    method: "POST",
  },
  {
    name: "moveSpecialistCustomToolToGlobal",
    run: () => moveSpecialistCustomToolToGlobal("agent-1", "tool-1", { overwrite: false }),
    url: "/api/specialists/agent-1/custom-tools/tool-1/move-to-global",
    method: "POST",
  },
  {
    name: "createSpecialist",
    run: () =>
      createSpecialist({
        name: "Aide",
        role: "helper",
        instructions: "help",
        defaultModel: "anthropic/claude",
        capabilities: {} as never,
      }),
    url: "/api/specialists",
    method: "POST",
  },
  {
    name: "updateSpecialist",
    run: () => updateSpecialist("agent-1", { name: "Aide" }),
    url: "/api/specialists/agent-1",
    method: "PATCH",
  },
  {
    name: "archiveSpecialist",
    run: () => archiveSpecialist("agent-1"),
    url: "/api/specialists/agent-1",
    method: "DELETE",
  },
  { name: "listTasks (no filters)", run: () => listTasks(), url: "/api/tasks" },
  {
    name: "listTasks (with filters)",
    run: () => listTasks({ status: "queued", agentId: "agent-1", includeArchived: true }),
    url: "/api/tasks?status=queued&agentId=agent-1&includeArchived=true",
  },
  {
    name: "enableTaskTemplate",
    run: () => enableTaskTemplate("tmpl-1"),
    url: "/api/tasks/templates/tmpl-1/enable",
    method: "POST",
  },
  {
    name: "disableTaskTemplate",
    run: () => disableTaskTemplate("tmpl-1"),
    url: "/api/tasks/templates/tmpl-1/disable",
    method: "POST",
  },
  {
    name: "archiveTask",
    run: () => archiveTask("task-1"),
    url: "/api/tasks/task-1/archive",
    method: "POST",
  },
  {
    name: "acceptTask",
    run: () => acceptTask("task-1"),
    url: "/api/tasks/task-1/accept",
    method: "POST",
  },
  {
    name: "restoreTask",
    run: () => restoreTask("task-1"),
    url: "/api/tasks/task-1/restore",
    method: "POST",
  },
  {
    name: "enableTask",
    run: () => enableTask("task-1"),
    url: "/api/tasks/task-1/enable",
    method: "POST",
  },
  {
    name: "disableTask",
    run: () => disableTask("task-1"),
    url: "/api/tasks/task-1/disable",
    method: "POST",
  },
  {
    name: "uploadTaskContextAttachment",
    run: () =>
      uploadTaskContextAttachment("task-1", {
        filename: "a.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,AAAA",
        sizeBytes: 4,
      }),
    url: "/api/tasks/task-1/context/attachments",
    method: "POST",
  },
  {
    name: "getActiveConversation",
    run: () => getActiveConversation("agent-1"),
    url: "/api/specialists/agent-1/conversations/active",
  },
  {
    name: "listConversations",
    run: () => listConversations("agent-1"),
    url: "/api/specialists/agent-1/conversations",
  },
  {
    name: "getConversation",
    run: () => getConversation("agent-1", "conv-1"),
    url: "/api/specialists/agent-1/conversations/conv-1",
  },
  {
    name: "getConversationSystemPrompts",
    run: () => getConversationSystemPrompts("conv-1"),
    url: "/api/conversations/conv-1/system-prompts",
  },
  {
    name: "setConversationSystemPromptEnabled",
    run: () => setConversationSystemPromptEnabled("conv-1", "prompt-1", true),
    url: "/api/conversations/conv-1/system-prompts/prompt-1",
    method: "PATCH",
  },
  {
    name: "archiveActivity",
    run: () => archiveActivity("act-1"),
    url: "/api/activities/act-1/archive",
    method: "POST",
  },
  {
    name: "archiveAllActivities",
    run: () => archiveAllActivities(),
    url: "/api/activities/archive-all",
    method: "POST",
  },
  {
    name: "unarchiveActivity",
    run: () => unarchiveActivity("act-1"),
    url: "/api/activities/act-1/unarchive",
    method: "POST",
  },
  {
    name: "fillSecret",
    run: () => fillSecret("act-1", "value"),
    url: "/api/activities/act-1/fill-secret",
    method: "POST",
  },
  { name: "getSystemPrompts", run: () => getSystemPrompts(), url: "/api/system-prompts" },
  { name: "getSystemPrompt", run: () => getSystemPrompt("sp-1"), url: "/api/system-prompts/sp-1" },
  {
    name: "saveSystemPrompt",
    run: () => saveSystemPrompt("sp-1", "body text"),
    url: "/api/system-prompts/sp-1",
    method: "PUT",
  },
  {
    name: "resetSystemPrompt",
    run: () => resetSystemPrompt("sp-1"),
    url: "/api/system-prompts/sp-1",
    method: "DELETE",
  },
  {
    name: "startFreshConversation",
    run: () => startFreshConversation("agent-1"),
    url: "/api/specialists/agent-1/conversations/start-fresh",
    method: "POST",
  },
  {
    name: "fetchConversationMedia",
    run: () => fetchConversationMedia("conv-1"),
    url: "/api/conversations/conv-1/media",
  },
  {
    name: "listFileManagerNodes",
    run: () => listFileManagerNodes({ root: "workspace", path: "sub" }),
    url: "/api/file-manager/nodes?root=workspace&path=sub",
  },
  {
    name: "createFileManagerEntry",
    run: () => createFileManagerEntry({ root: "workspace", name: "f.txt", type: "file" }),
    url: "/api/file-manager/entries",
    method: "POST",
  },
  {
    name: "renameFileManagerEntry",
    run: () => renameFileManagerEntry({ root: "workspace", path: "a.txt", name: "b.txt" }),
    url: "/api/file-manager/entries",
    method: "PATCH",
  },
  {
    name: "uploadFileManagerEntries",
    run: () =>
      uploadFileManagerEntries({
        root: "workspace",
        entries: [{ name: "a.txt", relativePath: "a.txt", contentBase64: "QQ==", sizeBytes: 1 }],
      }),
    url: "/api/file-manager/uploads",
    method: "POST",
  },
  {
    name: "getFileManagerFileContent",
    run: () => getFileManagerFileContent({ root: "workspace", path: "a.txt" }),
    url: "/api/file-manager/files/content?root=workspace&path=a.txt",
  },
  {
    name: "getFileManagerPreferences",
    run: () => getFileManagerPreferences(),
    url: "/api/file-manager/preferences",
  },
  {
    name: "updateFileManagerPreferences",
    run: () => updateFileManagerPreferences({ allowHostFilesystemEdits: true } as never),
    url: "/api/file-manager/preferences",
    method: "PUT",
  },
  {
    name: "moveFileManagerEntry",
    run: () =>
      moveFileManagerEntry({ root: "workspace", path: "a.txt", destinationPath: "sub/a.txt" }),
    url: "/api/file-manager/entries/move",
    method: "POST",
  },
  {
    name: "searchFileManagerDirectories",
    run: () =>
      searchFileManagerDirectories({
        root: "workspace",
        query: "src",
        excludePath: "node_modules",
        limit: 10,
      }),
    url: "/api/file-manager/directories?root=workspace&query=src&excludePath=node_modules&limit=10",
  },
  {
    name: "submitProviderApiKey",
    run: () => submitProviderApiKey("anthropic", "sk-test"),
    url: "/api/providers/anthropic/api-key",
    method: "PUT",
  },
  {
    name: "startProviderOauth",
    run: () => startProviderOauth("anthropic", 0, { region: "us" }),
    url: "/api/providers/anthropic/oauth/start",
    method: "POST",
  },
  {
    name: "completeProviderOauth",
    run: () => completeProviderOauth("anthropic", 0, "code-1"),
    url: "/api/providers/anthropic/oauth/complete",
    method: "POST",
  },
  {
    name: "disconnectProvider",
    run: () => disconnectProvider("anthropic"),
    url: "/api/providers/anthropic",
    method: "DELETE",
  },
  {
    name: "createTerminalSession",
    run: () => createTerminalSession({} as never),
    url: "/api/terminal",
    method: "POST",
  },
  { name: "listTerminalSessions", run: () => listTerminalSessions(), url: "/api/terminal" },
];

describe("requestJson-based wrappers reject and hit the expected endpoint", () => {
  for (const testCase of requestJsonCases) {
    it(testCase.name, async () => {
      const fetchSpy = stubError();

      await expect(testCase.run()).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledWith(
        testCase.url,
        expect.objectContaining({ method: testCase.method ?? "GET" }),
      );
    });
  }
});

// Void wrappers that use apiFetch directly and only throw on a non-ok, non-204
// response. Testing both the error and the success (204) branch covers all of
// their statements and both sides of the guard.
const voidCases: Case[] = [
  {
    name: "deleteMcpServer",
    run: () => deleteMcpServer("srv-1"),
    url: "/api/mcp-servers/srv-1",
    method: "DELETE",
  },
  {
    name: "revokeApiToken",
    run: () => revokeApiToken("tok-1"),
    url: "/api/api-tokens/tok-1",
    method: "DELETE",
  },
  {
    name: "setSecret",
    run: () => setSecret("KEY", "value"),
    url: "/api/secrets/KEY",
    method: "PUT",
  },
  {
    name: "deleteSecret",
    run: () => deleteSecret("KEY"),
    url: "/api/secrets/KEY",
    method: "DELETE",
  },
  {
    name: "deleteCustomTool",
    run: () => deleteCustomTool("tool-1"),
    url: "/api/custom-tools/tool-1",
    method: "DELETE",
  },
  {
    name: "deleteWorkspaceSkill",
    run: () => deleteWorkspaceSkill("skill-1"),
    url: "/api/workspace-skills/skill-1",
    method: "DELETE",
  },
  {
    name: "deleteSpecialistCustomTool",
    run: () => deleteSpecialistCustomTool("agent-1", "tool-1"),
    url: "/api/specialists/agent-1/custom-tools/tool-1",
    method: "DELETE",
  },
  {
    name: "deleteTask",
    run: () => deleteTask("task-1"),
    url: "/api/tasks/task-1",
    method: "DELETE",
  },
  {
    name: "revokeArtifactShareLink",
    run: () => revokeArtifactShareLink("art-1", "share-1"),
    url: "/api/artifacts/art-1/share-links/share-1",
    method: "DELETE",
  },
  {
    name: "deleteFileManagerEntry",
    run: () => deleteFileManagerEntry({ root: "workspace", path: "a.txt" }),
    url: "/api/file-manager/entries?root=workspace&path=a.txt",
    method: "DELETE",
  },
  {
    name: "deleteConversation",
    run: () => deleteConversation("agent-1", "conv-1"),
    url: "/api/specialists/agent-1/conversations/conv-1",
    method: "DELETE",
  },
  {
    name: "sendPrompt",
    run: () => sendPrompt("conv-1", { text: "hi", attachments: [] }),
    url: "/api/conversations/conv-1/prompt?stream=true",
    method: "POST",
  },
  {
    name: "abortConversation",
    run: () => abortConversation("conv-1"),
    url: "/api/conversations/conv-1/abort",
    method: "POST",
  },
  {
    name: "replyPermission",
    run: () => replyPermission("conv-1", "req-1", "once"),
    url: "/api/conversations/conv-1/permissions/req-1/reply",
    method: "POST",
  },
  {
    name: "replyQuestion",
    run: () => replyQuestion("conv-1", "req-1", [["yes"]]),
    url: "/api/conversations/conv-1/questions/req-1/reply",
    method: "POST",
  },
  {
    name: "rejectQuestion",
    run: () => rejectQuestion("conv-1", "req-1"),
    url: "/api/conversations/conv-1/questions/req-1/reject",
    method: "POST",
  },
  {
    name: "sendShell",
    run: () => sendShell("conv-1", "ls"),
    url: "/api/conversations/conv-1/shell",
    method: "POST",
  },
  {
    name: "sendCommand",
    run: () => sendCommand("conv-1", "cmd", "args"),
    url: "/api/conversations/conv-1/command",
    method: "POST",
  },
  {
    name: "summarizeConversation",
    run: () => summarizeConversation("conv-1"),
    url: "/api/conversations/conv-1/summarize",
    method: "POST",
  },
  {
    name: "resizeTerminalSession",
    run: () => resizeTerminalSession("term-1", { cols: 80, rows: 24 }),
    url: "/api/terminal/term-1/resize",
    method: "POST",
  },
  {
    name: "closeTerminalSession",
    run: () => closeTerminalSession("term-1"),
    url: "/api/terminal/term-1",
    method: "DELETE",
  },
];

describe("void wrappers", () => {
  for (const testCase of voidCases) {
    it(`${testCase.name} throws on error response`, async () => {
      const fetchSpy = stubError(500, "Server Error");

      await expect(testCase.run()).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledWith(
        testCase.url,
        expect.objectContaining({ method: testCase.method ?? "GET" }),
      );
    });

    it(`${testCase.name} resolves on 204`, async () => {
      stubNoContent();
      await expect(testCase.run()).resolves.not.toThrow();
    });
  }
});

describe("wrappers with bespoke error handling", () => {
  it("activateMcpServer throws McpEngineRestartRequiredError when restart consent is needed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "conflict",
            message: "Restart required.",
            details: { reason: "engine_restart_required" },
          },
        },
        { status: 409, statusText: "Conflict" },
      ),
    );

    await expect(activateMcpServer("composio", { restartEngine: false })).rejects.toBeInstanceOf(
      McpEngineRestartRequiredError,
    );
  });

  it("activateMcpServer returns the activated server after restart consent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: "composio",
        name: "composio",
        enabled: true,
        config: {
          transport: "streamable-http",
          url: "https://connect.composio.dev/mcp",
          authMethod: "headers",
          headers: [],
        },
        missingSecrets: [],
        requiresEngineRestart: false,
        tools: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    await expect(activateMcpServer("composio", { restartEngine: true })).resolves.toMatchObject({
      enabled: true,
      requiresEngineRestart: false,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/mcp-servers/composio/activate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ restartEngine: true }) }),
    );
  });

  it("saveFileManagerFileContent throws FileSaveConflictError on 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { error: { message: "conflict", details: { currentRevision: fileRevision } } },
        { status: 409, statusText: "Conflict" },
      ),
    );

    await expect(
      saveFileManagerFileContent({
        root: "workspace",
        path: "a.txt",
        content: "x",
        expectedRevision: fileRevision,
      }),
    ).rejects.toBeInstanceOf(FileSaveConflictError);
  });

  it("saveFileManagerFileContent throws a generic error on other failures", async () => {
    stubError(500, "Server Error");
    await expect(
      saveFileManagerFileContent({
        root: "workspace",
        path: "a.txt",
        content: "x",
        expectedRevision: fileRevision,
      }),
    ).rejects.toThrow("boom");
  });

  it("saveFileManagerFileContent returns the parsed response on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ path: "a.txt", revision: fileRevision }),
    );

    await expect(
      saveFileManagerFileContent({
        root: "workspace",
        path: "a.txt",
        content: "x",
        expectedRevision: fileRevision,
      }),
    ).resolves.toEqual({ path: "a.txt", revision: fileRevision });
  });

  it("uploadWorkspaceSkill throws WorkspaceSkillUploadRenameError when a rename is suggested", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: {
            message: "rename required",
            details: { renameSuggestedFrom: "Skill", renameSuggestedTo: "skill" },
          },
        },
        { status: 400, statusText: "Bad Request" },
      ),
    );

    await expect(
      uploadWorkspaceSkill({
        entries: [
          { name: "SKILL.md", relativePath: "SKILL.md", contentBase64: "QQ==", sizeBytes: 1 },
        ],
        overwrite: false,
      }),
    ).rejects.toBeInstanceOf(WorkspaceSkillUploadRenameError);
  });

  it("uploadWorkspaceSkill throws a generic error on other 400s", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "invalid" } }, { status: 400, statusText: "Bad Request" }),
    );

    await expect(
      uploadWorkspaceSkill({
        entries: [
          { name: "SKILL.md", relativePath: "SKILL.md", contentBase64: "QQ==", sizeBytes: 1 },
        ],
        overwrite: false,
      }),
    ).rejects.toThrow("invalid");
  });

  it("updateWorkspaceSkillCategory throws on error and returns parsed data on success", async () => {
    stubError(500, "Server Error");
    await expect(updateWorkspaceSkillCategory("skill-1", { category: "docs" })).rejects.toThrow(
      "boom",
    );
  });
});

describe("buildFileManagerDownloadHref", () => {
  it("builds an encoded download URL for the given root and path", () => {
    expect(buildFileManagerDownloadHref({ root: "workspace", path: "notes/report card.md" })).toBe(
      "/api/file-manager/files/download?root=workspace&path=notes%2Freport+card.md",
    );
  });
});

describe("buildFileManagerZipDownloadHref", () => {
  it("builds an encoded zip download URL for the given root and folder path", () => {
    expect(buildFileManagerZipDownloadHref({ root: "all-specialists", path: "agent-a/docs" })).toBe(
      "/api/file-manager/files/download-zip?root=all-specialists&path=agent-a%2Fdocs",
    );
  });
});
