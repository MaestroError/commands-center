import { afterEach, describe, expect, it, vi } from "vitest";

import {
  abortConversation,
  cancelLiveRequest,
  changeOwnerPassword,
  claimWorkspace,
  checkSystemVersion,
  closeTerminalSession,
  completeMcpAuth,
  connectTerminalWebSocket,
  connectConversationEvents,
  connectWorkspaceEvents,
  deleteConversation,
  deleteAgentCustomTool,
  deleteCustomTool,
  deleteSecret,
  deleteTask,
  deleteWorkspaceSkill,
  type FileSaveConflictError,
  getWorkspaceTree,
  listTerminalSessions,
  logoutOwner,
  readApiError,
  removeMcpAuth,
  resizeTerminalSession,
  saveFileManagerFileContent,
  searchWorkspaceFiles,
  sendCommand,
  setSecret,
  summarizeConversation,
  uploadWorkspaceSkill,
  type WorkspaceSkillUploadRenameError,
} from "./api";

function makeSseResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, { status: 200, ...init });
}

function makeJsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

async function collectEvents(chunks: string[]): Promise<unknown[]> {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse(chunks));

  const events: unknown[] = [];
  for await (const event of connectConversationEvents("conv-1", new AbortController().signal)) {
    events.push(event);
  }

  return events;
}

async function collectWorkspaceEvents(chunks: string[]): Promise<unknown[]> {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeSseResponse(chunks));

  const events: unknown[] = [];
  for await (const event of connectWorkspaceEvents("agent-1", new AbortController().signal)) {
    events.push(event);
  }

  return events;
}

afterEach(() => {
  document.cookie = "cc_csrf_token=; Max-Age=0; path=/";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("connectConversationEvents", () => {
  it("yields parsed events from well-formed data blocks", async () => {
    const events = await collectEvents([
      'data: {"type":"connected","properties":{}}\n\n',
      'data: {"type":"heartbeat","properties":{}}\n\n',
    ]);

    expect(events).toEqual([
      { type: "connected", properties: {} },
      { type: "heartbeat", properties: {} },
    ]);
  });

  it("handles block splitting with leftover buffer remainder", async () => {
    const events = await collectEvents([
      'data: {"type":"connected","properties":{}}\n\nda',
      'ta: {"type":"heartbeat","properties":{}}\n\n',
    ]);

    expect(events).toEqual([
      { type: "connected", properties: {} },
      { type: "heartbeat", properties: {} },
    ]);
  });

  it("skips blocks with no data line", async () => {
    const events = await collectEvents([
      "event: ping\n\n",
      'data: {"type":"connected","properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "connected", properties: {} }]);
  });

  it("skips and warns on blocks that fail chatEventSchema validation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const events = await collectEvents([
      'data: {"type":"not-real","properties":{}}\n\n',
      'data: {"type":"connected","properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "connected", properties: {} }]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("joins multi-line data fields with newline", async () => {
    const events = await collectEvents([
      'data: {"type":"heartbeat",\n' + 'data: "properties":{}}\n\n',
    ]);

    expect(events).toEqual([{ type: "heartbeat", properties: {} }]);
  });

  it("throws on non-OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("boom", { status: 500, statusText: "Server Error" }),
    );

    await expect(
      connectConversationEvents("conv-1", new AbortController().signal).next(),
    ).rejects.toThrow("SSE connection failed with status 500");
  });

  it("throws when response body is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(
      connectConversationEvents("conv-1", new AbortController().signal).next(),
    ).rejects.toThrow("SSE response has no body");
  });
});

describe("deleteConversation", () => {
  it("treats HTTP 204 as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteConversation("agent-1", "conv-1")).resolves.toBeUndefined();
  });
});

describe("sendCommand", () => {
  it("sends arguments as an empty string when args is undefined", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await sendCommand("conv-1", "compact");

    expect(fetchSpy).toHaveBeenCalledWith("/api/conversations/conv-1/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "compact", arguments: "" }),
    });
  });
});

describe("searchWorkspaceFiles", () => {
  it("requests the global workspace file search endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          nameMatches: [{ path: "src/index.ts" }],
          contentMatches: [{ path: "README.md", lineNumber: 3, lineText: "hello world" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(searchWorkspaceFiles("index")).resolves.toEqual({
      nameMatches: [{ path: "src/index.ts" }],
      contentMatches: [{ path: "README.md", lineNumber: 3, lineText: "hello world" }],
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/search/files?query=index", {
      method: "GET",
    });
  });
});

describe("summarizeConversation", () => {
  it("posts without sending an empty json content type", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await summarizeConversation("conv-1");

    expect(fetchSpy).toHaveBeenCalledWith("/api/conversations/conv-1/summarize", {
      method: "POST",
    });
  });
});

describe("readApiError", () => {
  it("reads message from a JSON error payload", () => {
    expect(readApiError({ error: { message: "nope" } }, 400, "Bad Request")).toBe("nope");
  });

  it("reads validation issues from a JSON error payload", () => {
    expect(
      readApiError(
        {
          error: {
            message: "Owner password does not meet requirements.",
            details: {
              issues: [
                "Password must include at least one uppercase letter.",
                "Password must include at least one number.",
              ],
            },
          },
        },
        400,
        "Bad Request",
      ),
    ).toBe(
      "Password must include at least one uppercase letter. Password must include at least one number.",
    );
  });

  it("falls back to status text when message is missing", () => {
    expect(readApiError({ error: {} }, 500, "Server Error")).toBe("Server Error");
  });
});

describe("additional request wrapper coverage", () => {
  it.each<{
    name: string;
    run: () => Promise<unknown>;
    expectedUrl: string;
    expectedInit: RequestInit;
  }>([
    {
      name: "completeMcpAuth posts callback payload",
      run: () => completeMcpAuth("mcp/1", "oauth-code"),
      expectedUrl: "/api/mcp-servers/mcp%2F1/auth/callback",
      expectedInit: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "oauth-code" }),
      },
    },
    {
      name: "removeMcpAuth deletes the auth session",
      run: () => removeMcpAuth("mcp/1"),
      expectedUrl: "/api/mcp-servers/mcp%2F1/auth",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "cancelLiveRequest posts the parsed cancel payload",
      run: () => cancelLiveRequest("conv/1", "req/1", {}),
      expectedUrl: "/api/conversations/conv%2F1/live-requests/req%2F1/cancel",
      expectedInit: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    },
    {
      name: "abortConversation posts without a JSON body",
      run: () => abortConversation("conv/1"),
      expectedUrl: "/api/conversations/conv%2F1/abort",
      expectedInit: { method: "POST" },
    },
  ])("$name", async ({ run, expectedUrl, expectedInit }) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ error: { message: "boom" } }, { status: 500 }));

    await expect(run()).rejects.toThrow("boom");
    expect(fetchSpy).toHaveBeenCalledWith(expectedUrl, expectedInit);
  });

  it.each<{
    name: string;
    run: () => Promise<unknown>;
    expectedUrl: string;
    expectedInit: RequestInit;
  }>([
    {
      name: "checkSystemVersion posts a manual version check request",
      run: () => checkSystemVersion(),
      expectedUrl: "/api/system/version/check",
      expectedInit: { method: "POST" },
    },
    {
      name: "setSecret serializes the secret value",
      run: () => setSecret("OPENAI KEY", "secret-value"),
      expectedUrl: "/api/secrets/OPENAI%20KEY",
      expectedInit: {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "secret-value" }),
      },
    },
    {
      name: "deleteSecret deletes the encoded secret key",
      run: () => deleteSecret("OPENAI KEY"),
      expectedUrl: "/api/secrets/OPENAI%20KEY",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "deleteCustomTool deletes the encoded tool slug",
      run: () => deleteCustomTool("my/tool"),
      expectedUrl: "/api/custom-tools/my%2Ftool",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "deleteWorkspaceSkill deletes the encoded workspace skill slug",
      run: () => deleteWorkspaceSkill("skill/name"),
      expectedUrl: "/api/workspace-skills/skill%2Fname",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "deleteAgentCustomTool deletes the encoded agent tool slug",
      run: () => deleteAgentCustomTool("agent/1", "tool/name"),
      expectedUrl: "/api/agents/agent%2F1/custom-tools/tool%2Fname",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "deleteTask deletes the encoded task id",
      run: () => deleteTask("task/1"),
      expectedUrl: "/api/tasks/task%2F1",
      expectedInit: { method: "DELETE" },
    },
    {
      name: "resizeTerminalSession posts the parsed resize payload",
      run: () => resizeTerminalSession("terminal-1", { cols: 120, rows: 40 }),
      expectedUrl: "/api/terminal/terminal-1/resize",
      expectedInit: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols: 120, rows: 40 }),
      },
    },
    {
      name: "closeTerminalSession deletes the terminal session",
      run: () => closeTerminalSession("terminal-1"),
      expectedUrl: "/api/terminal/terminal-1",
      expectedInit: { method: "DELETE" },
    },
  ])("$name", async ({ run, expectedUrl, expectedInit }) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ error: { message: "boom" } }, { status: 500 }));

    await expect(run()).rejects.toThrow("boom");
    expect(fetchSpy).toHaveBeenCalledWith(expectedUrl, expectedInit);
  });

  it("setSecret treats HTTP 204 as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(setSecret("OPENAI_KEY", "secret-value")).resolves.toBeUndefined();
  });

  it("sends the CSRF token cookie on mutating JSON requests", async () => {
    document.cookie = "cc_csrf_token=csrf-token; path=/";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ status: "claimed-authenticated" }));

    await claimWorkspace({
      claimCode: "claim-code",
      password: "owner-password",
      confirmPassword: "owner-password",
      rememberBrowser: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/claim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        claimCode: "claim-code",
        password: "owner-password",
        confirmPassword: "owner-password",
        rememberBrowser: true,
      }),
    });
  });

  it("sends the CSRF token cookie on mutating requests without a body", async () => {
    document.cookie = "cc_csrf_token=csrf-token; path=/";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ status: "claimed-unauthenticated" }));

    await logoutOwner();

    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { "x-csrf-token": "csrf-token" },
    });
  });

  it("posts owner password changes with a CSRF token", async () => {
    document.cookie = "cc_csrf_token=csrf-token; path=/";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeJsonResponse({ status: "changed", otherSessionsRevoked: true }));

    await changeOwnerPassword({
      currentPassword: "current-password",
      newPassword: "new-owner-password",
      confirmNewPassword: "new-owner-password",
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-token" },
      body: JSON.stringify({
        currentPassword: "current-password",
        newPassword: "new-owner-password",
        confirmNewPassword: "new-owner-password",
      }),
    });
  });

  it("resizeTerminalSession treats HTTP 204 as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      resizeTerminalSession("terminal-1", { cols: 80, rows: 24 }),
    ).resolves.toBeUndefined();
  });

  it("throws a rename error with suggested names when workspace skill upload collides", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse(
        {
          error: {
            message: "A workspace skill with that name already exists.",
            details: {
              renameSuggestedFrom: "existing-skill",
              renameSuggestedTo: "existing-skill-copy",
            },
          },
        },
        { status: 400 },
      ),
    );

    await expect(
      uploadWorkspaceSkill({
        entries: [
          {
            name: "SKILL.md",
            relativePath: "existing-skill/SKILL.md",
            contentBase64: "U0tJTEw=",
            sizeBytes: 5,
          },
        ],
        overwrite: false,
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceSkillUploadRenameError",
      renameSuggestedFrom: "existing-skill",
      renameSuggestedTo: "existing-skill-copy",
    } satisfies Partial<WorkspaceSkillUploadRenameError>);
  });

  it("throws a file conflict error with the current revision details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse(
        {
          error: {
            message: "File changed on disk.",
            details: {
              currentRevision: {
                mtimeMs: 2,
                sizeBytes: 64,
                sha256: "b".repeat(64),
              },
            },
          },
        },
        { status: 409 },
      ),
    );

    await expect(
      saveFileManagerFileContent({
        root: "workspace",
        path: "src/index.ts",
        content: "console.log('hello');",
        expectedRevision: {
          mtimeMs: 1,
          sizeBytes: 32,
          sha256: "a".repeat(64),
        },
      }),
    ).rejects.toMatchObject({
      name: "FileSaveConflictError",
      currentRevision: {
        mtimeMs: 2,
        sizeBytes: 64,
        sha256: "b".repeat(64),
      },
    } satisfies Partial<FileSaveConflictError>);
  });

  it("lists terminal sessions by unwrapping the sessions payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse({
        sessions: [
          {
            id: "term-1",
            backend: "opencode",
            cwd: "/tmp/project",
            createdAt: 1710000000,
          },
        ],
      }),
    );

    await expect(listTerminalSessions()).resolves.toEqual([
      {
        id: "term-1",
        backend: "opencode",
        cwd: "/tmp/project",
        createdAt: 1710000000,
      },
    ]);
  });

  it("filters ignored workspace nodes and maps the visible fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeJsonResponse([
        {
          name: "src",
          path: "src",
          absolute: "/tmp/project/src",
          type: "directory",
          ignored: false,
          isCritical: true,
          criticalReason: "Pinned workspace folder",
        },
        {
          name: ".cache",
          path: ".cache",
          absolute: "/tmp/project/.cache",
          type: "directory",
          ignored: true,
        },
      ]),
    );

    await expect(getWorkspaceTree("agent/1", "src")).resolves.toEqual([
      {
        name: "src",
        path: "src",
        type: "directory",
        isCritical: true,
        criticalReason: "Pinned workspace folder",
      },
    ]);
  });

  it("parses workspace SSE events", async () => {
    const events = await collectWorkspaceEvents([
      'data: {"type":"heartbeat","properties":{}}\n\n',
      'data: {"type":"workspace.changed","properties":{"version":2}}\n\n',
    ]);

    expect(events).toEqual([
      { type: "heartbeat", properties: {} },
      { type: "workspace.changed", properties: { version: 2 } },
    ]);
  });

  it("throws when the workspace SSE connection is not OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("boom", { status: 503, statusText: "Service Unavailable" }),
    );

    await expect(
      connectWorkspaceEvents("agent-1", new AbortController().signal).next(),
    ).rejects.toThrow("Workspace SSE connection failed with status 503");
  });

  it("opens terminal sockets over ws on non-https pages", () => {
    const webSocketSpy = vi.fn();
    vi.stubGlobal("WebSocket", webSocketSpy);

    connectTerminalWebSocket("terminal-1");

    expect(webSocketSpy).toHaveBeenCalledWith(
      `ws://${window.location.host}/api/terminal/terminal-1/connect`,
    );
  });
});
