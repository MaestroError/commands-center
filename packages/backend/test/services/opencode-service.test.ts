import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import type { OpencodeClient } from "../../src/lib/opencode-client.js";
import type { RuntimeConfig } from "../../src/lib/runtime-config.js";
import { createOpenCodeService } from "../../src/services/opencode-service.js";

const scopedClientMock = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("../../src/lib/opencode-client.js", () => ({
  createScopedOpenCodeClient: scopedClientMock.create,
}));

const BASE_URL = "http://opencode.test:1234";

function createConfig(): RuntimeConfig {
  return {
    opencode: { baseUrl: BASE_URL },
    timeouts: { opencodeRequestMs: 30_000 },
  } as unknown as RuntimeConfig;
}

function createLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger & { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
}

function jsonResponse(status = 200, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

const FAKE_CLIENT = {} as OpencodeClient;

describe("opencode-service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("promptSessionAsync", () => {
    it("posts to /session/{id}/prompt_async (not /message)", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

      expect(url.pathname).toBe("/session/sess-1/prompt_async");
      expect(url.searchParams.get("directory")).toBe("/work/agent-a");
      expect(init.method).toBe("POST");
    });

    it("includes `system` in the body only when provided", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
        system: "You are Ada.",
      });
      const withSystem = JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(withSystem["system"]).toBe("You are Ada.");

      fetchMock.mockClear();
      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
      });
      const withoutSystem = JSON.parse(
        (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
      ) as Record<string, unknown>;
      expect(withoutSystem).not.toHaveProperty("system");
    });

    it("normalizes a Markdown attachment and its data URL to text/plain", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "github-copilot", modelID: "gpt-5" },
        text: "review",
        attachments: [
          {
            type: "document",
            filename: "notes.md",
            mimeType: "text/markdown",
            dataUrl: "data:text/markdown;base64,IyBOb3Rlcw==",
          },
        ],
      });

      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
        parts: Array<Record<string, unknown>>;
      };
      expect(body.parts[1]).toEqual({
        type: "file",
        mime: "text/plain",
        filename: "notes.md",
        url: "data:text/plain;base64,IyBOb3Rlcw==",
      });
    });

    it.each([
      {
        filename: "data.csv",
        mimeType: "text/csv",
        dataUrl: "data:text/csv;base64,YSxiCjEsMg==",
      },
      {
        filename: "data.json",
        mimeType: "application/json",
        dataUrl: "data:application/json;base64,e30=",
      },
    ])("normalizes $filename consistently with chat", async ({ filename, mimeType, dataUrl }) => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "github-copilot", modelID: "gpt-5" },
        text: "review",
        attachments: [{ type: "document", filename, mimeType, dataUrl }],
      });

      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
        parts: Array<Record<string, unknown>>;
      };
      expect(body.parts[1]).toEqual({
        type: "file",
        mime: "text/plain",
        filename,
        url: `data:text/plain;base64,${dataUrl.split(",")[1] ?? ""}`,
      });
    });

    it.each([
      {
        filename: "image.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,aW1hZ2U=",
        type: "image" as const,
      },
      {
        filename: "report.pdf",
        mimeType: "application/pdf",
        dataUrl: "data:application/pdf;base64,JVBERg==",
        type: "document" as const,
      },
    ])("preserves $filename without transport normalization", async (attachment) => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "github-copilot", modelID: "gpt-5" },
        text: "review",
        attachments: [attachment],
      });

      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
        parts: Array<Record<string, unknown>>;
      };
      expect(body.parts[1]).toEqual({
        type: "file",
        mime: attachment.mimeType,
        filename: attachment.filename,
        url: attachment.dataUrl,
      });
    });

    it("rejects when the underlying request fails", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(
        service.promptSessionAsync({
          directory: "/work/agent-a",
          sessionID: "sess-1",
          agent: "build",
          model: { providerID: "anthropic", modelID: "claude" },
          text: "hello",
        }),
      ).rejects.toThrow("boom");
    });

    it("rejects on upstream non-2xx responses", async () => {
      fetchMock.mockResolvedValue(new Response("server is sad", { status: 500 }));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(
        service.promptSessionAsync({
          directory: "/work/agent-a",
          sessionID: "sess-1",
          agent: "build",
          model: { providerID: "anthropic", modelID: "claude" },
          text: "hello",
        }),
      ).rejects.toThrow(
        "OpenCode request failed: POST /session/sess-1/prompt_async → 500: server is sad",
      );
    });
  });

  describe("session status", () => {
    it("lists session statuses from /session/status", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          "sess-busy": { type: "busy" },
          "sess-retry": { type: "retry", attempt: 1, message: "Rate limited", next: 5000 },
        }),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const statuses = await service.listSessionStatuses("/work/agent-a");

      expect(statuses["sess-busy"]).toEqual({ type: "busy" });
      expect(statuses["sess-retry"]).toEqual({
        type: "retry",
        attempt: 1,
        message: "Rate limited",
        next: 5000,
      });

      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(url.pathname).toBe("/session/status");
      expect(url.searchParams.get("directory")).toBe("/work/agent-a");
      expect(init.method).toBe("GET");
    });

    it("treats a missing session status entry as idle", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { "other-session": { type: "busy" } }));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.getSessionStatus("/work/agent-a", "sess-idle")).resolves.toEqual({
        type: "idle",
      });
    });

    it("rejects malformed session status payloads", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { "sess-bad": { type: "retry", message: "missing fields" } }),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.listSessionStatuses("/work/agent-a")).rejects.toThrow();
    });
  });

  describe("pending interactions", () => {
    it("lists pending permissions from /permission", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            id: "perm-1",
            sessionID: "sess-1",
            permission: "external_directory",
            patterns: ["/work/*"],
            always: ["/work"],
            metadata: { source: "tool" },
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.listPendingPermissions("/work/agent-a");

      expect(result).toEqual([
        {
          id: "perm-1",
          sessionID: "sess-1",
          permission: "external_directory",
          patterns: ["/work/*"],
          always: ["/work"],
          metadata: { source: "tool" },
        },
      ]);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(url.pathname).toBe("/permission");
      expect(url.searchParams.get("directory")).toBe("/work/agent-a");
      expect(init.method).toBe("GET");
    });

    it("rejects pending permissions with empty pattern entries", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            id: "perm-1",
            sessionID: "sess-1",
            permission: "external_directory",
            patterns: [""],
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.listPendingPermissions("/work/agent-a")).rejects.toThrow();
    });

    it("rejects pending permissions with empty always entries", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            id: "perm-1",
            sessionID: "sess-1",
            permission: "external_directory",
            patterns: ["/work/*"],
            always: [""],
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.listPendingPermissions("/work/agent-a")).rejects.toThrow();
    });

    it("rejects pending questions without question entries", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            id: "question-1",
            sessionID: "sess-1",
            questions: [],
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.listPendingQuestions("/work/agent-a")).rejects.toThrow();
    });
  });

  describe("disposeGlobal", () => {
    it("posts to /global/dispose", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, true));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.disposeGlobal();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(url.toString()).toBe(`${BASE_URL}/global/dispose`);
      expect(init.method).toBe("POST");
    });

    it("logs a warning on non-2xx responses", async () => {
      fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
      const logger = createLogger();
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger,
      });

      await service.disposeGlobal();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ status: 500, body: "nope" }),
        expect.stringContaining("non-2xx"),
      );
    });

    it("logs a warning when fetch rejects", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const logger = createLogger();
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger,
      });

      await service.disposeGlobal();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining("failed"),
      );
    });

    it("coalesces concurrent calls into a single in-flight request", async () => {
      let resolveFetch: (value: Response) => void = () => {};
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchMock.mockReturnValue(pendingFetch);
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const a = service.disposeGlobal();
      const b = service.disposeGlobal();
      const c = service.disposeGlobal();

      expect(fetchMock).toHaveBeenCalledTimes(1);

      resolveFetch(jsonResponse(200, true));
      await Promise.all([a, b, c]);
    });

    it("issues a fresh request after the previous call resolves", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, true));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await service.disposeGlobal();
      await service.disposeGlobal();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("file endpoints", () => {
    it("validates text search responses from /find", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            path: { text: "README.md" },
            lines: { text: "TODO: document this" },
            line_number: 7,
            absolute_offset: 99,
            submatches: [{ match: { text: "TODO" }, start: 0, end: 4 }],
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.findText("/work/agent-a", "TODO");

      expect(result).toEqual([
        {
          path: { text: "README.md" },
          lines: { text: "TODO: document this" },
          line_number: 7,
          absolute_offset: 99,
          submatches: [{ match: { text: "TODO" }, start: 0, end: 4 }],
        },
      ]);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/find");
      expect(url.searchParams.get("directory")).toBe("/work/agent-a");
      expect(url.searchParams.get("pattern")).toBe("TODO");
    });

    it("validates file-name search responses from /find/file", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, ["README.md", "src/README.md"]));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.findFiles("/work/agent-a", {
        query: "readme",
        type: "file",
        limit: 5,
      });

      expect(result).toEqual(["README.md", "src/README.md"]);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/find/file");
      expect(url.searchParams.get("query")).toBe("readme");
      expect(url.searchParams.get("type")).toBe("file");
      expect(url.searchParams.get("limit")).toBe("5");
    });

    it("validates file listing responses from /file", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            name: "src",
            path: "src",
            absolute: "/work/agent-a/src",
            type: "directory",
            ignored: false,
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.listFiles("/work/agent-a", "src");

      expect(result).toEqual([
        {
          name: "src",
          path: "src",
          absolute: "/work/agent-a/src",
          type: "directory",
          ignored: false,
        },
      ]);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/file");
      expect(url.searchParams.get("path")).toBe("src");
    });

    it("validates file content responses from /file/content", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          type: "text",
          content: "hello",
          diff: "diff --git a/README.md b/README.md",
        }),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.readFile("/work/agent-a", "README.md");

      expect(result).toEqual({
        type: "text",
        content: "hello",
        diff: "diff --git a/README.md b/README.md",
      });
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/file/content");
      expect(url.searchParams.get("path")).toBe("README.md");
    });

    it("validates file status responses from /file/status", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          {
            path: "README.md",
            added: 2,
            removed: 1,
            status: "modified",
          },
        ]),
      );
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      const result = await service.getFileStatus("/work/agent-a");

      expect(result).toEqual([
        {
          path: "README.md",
          added: 2,
          removed: 1,
          status: "modified",
        },
      ]);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/file/status");
    });

    it("rejects invalid upstream file payloads", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, [{ nope: true }]));
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger: createLogger(),
      });

      await expect(service.listFiles("/work/agent-a", "src")).rejects.toThrow();
    });
  });

  function makeService() {
    return createOpenCodeService({
      client: FAKE_CLIENT,
      config: createConfig(),
      logger: createLogger(),
    });
  }

  describe("session lifecycle over fetch", () => {
    it("creates a session with title and permission rules", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: "sess-1", title: "Task", time: { created: 1, updated: 2 } }),
      );
      const service = makeService();

      const session = await service.createSession("/work/a", {
        title: "Task",
        permission: [{ permission: "edit", pattern: "*", action: "allow" }],
      });

      expect(session.id).toBe("sess-1");
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(url.pathname).toBe("/session");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("title", "Task");
      expect(body).toHaveProperty("permission");
    });

    it("gets a session and lists messages", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { id: "sess-1", parentID: "root", time: { created: 1 } }),
      );
      const service = makeService();
      await expect(service.getSession("/work/a", "sess-1")).resolves.toMatchObject({
        id: "sess-1",
        parentID: "root",
      });

      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, [
          {
            info: { id: "m1", sessionID: "sess-1", role: "assistant", time: { created: 2 } },
            parts: [{ id: "p1", type: "text", text: "hi" }],
          },
        ]),
      );
      const messages = await service.listSessionMessages("/work/a", "sess-1");
      expect(messages).toHaveLength(1);
    });

    it("resolves direct and nested descendants from verified parent relationships", async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, [
            { id: "child", parentID: "root", time: { created: 2 } },
            { id: "unrelated", parentID: "other", time: { created: 3 } },
          ]),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, [{ id: "nested", parentID: "child", time: { created: 4 } }]),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, [{ id: "child", parentID: "nested", time: { created: 2 } }]),
        );
      const service = makeService();

      await expect(service.getSessionTreeIds("/work/a", "root")).resolves.toEqual(
        new Set(["root", "child", "nested"]),
      );

      expect(fetchMock.mock.calls.map((call) => (call[0] as URL).pathname)).toEqual([
        "/session/root/children",
        "/session/child/children",
        "/session/nested/children",
      ]);
    });

    it("times out session-tree traversal using the configured request timeout", async () => {
      const hangingFetch = vi.fn((_url: URL, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => {
              const reason = init.signal?.reason;
              reject(reason instanceof Error ? reason : new Error("aborted"));
            },
            { once: true },
          );
        });
      });
      vi.stubGlobal("fetch", hangingFetch);
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: {
          ...createConfig(),
          timeouts: { ...createConfig().timeouts, opencodeRequestMs: 5 },
        },
        logger: createLogger(),
      });

      await expect(service.getSessionTreeIds("/work/a", "root")).rejects.toThrow();
      expect((hangingFetch.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    });

    it("combines the caller signal with the session-tree timeout", async () => {
      const hangingFetch = vi.fn((_url: URL, init: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => {
              const reason = init.signal?.reason;
              reject(reason instanceof Error ? reason : new Error("aborted"));
            },
            { once: true },
          );
        });
      });
      vi.stubGlobal("fetch", hangingFetch);
      const caller = new AbortController();
      const service = makeService();
      const traversal = service.getSessionTreeIds("/work/a", "root", caller.signal);
      await vi.waitFor(() => expect(hangingFetch).toHaveBeenCalledOnce());

      caller.abort(new Error("caller cancelled"));

      await expect(traversal).rejects.toThrow("caller cancelled");
      expect((hangingFetch.mock.calls[0]?.[1] as RequestInit).signal).not.toBe(caller.signal);
    });

    it("rejects malformed child session payloads", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, [{ id: "child", parentID: "root" }]));
      const service = makeService();

      await expect(service.listSessionChildren("/work/a", "root")).rejects.toThrow();
    });

    it("fails closed when a session tree exceeds the traversal limit", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          200,
          Array.from({ length: 1_000 }, (_, index) => ({
            id: `child-${String(index)}`,
            parentID: "root",
            time: { created: index + 1 },
          })),
        ),
      );
      const service = makeService();

      await expect(service.getSessionTreeIds("/work/a", "root")).rejects.toThrow(
        "OpenCode session tree exceeds 1000 sessions.",
      );
    });

    it("prompts a session synchronously and returns the assistant message", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          info: { id: "m2", sessionID: "sess-1", role: "assistant", time: { created: 3 } },
          parts: [{ id: "p2", type: "text", text: "done" }],
        }),
      );
      const service = makeService();
      const message = await service.promptSession({
        directory: "/work/a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "openai", modelID: "gpt-4.1" },
        text: "go",
        system: "be brief",
        attachments: [
          { type: "file", mimeType: "text/plain", filename: "n.txt", dataUrl: "data:," },
        ],
      });
      expect(message.info.id).toBe("m2");
      const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
        parts: unknown[];
        system: string;
      };
      expect(body.system).toBe("be brief");
      expect(body.parts).toHaveLength(2);
    });

    it("issues command, summarize, shell, and abort/delete requests", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = makeService();

      await service.commandSession({
        directory: "/work/a",
        sessionID: "s",
        agent: "build",
        model: "openai/gpt-4.1",
        command: "test",
        arguments: "--all",
      });
      await service.summarizeSession({
        directory: "/work/a",
        sessionID: "s",
        providerID: "openai",
        modelID: "gpt-4.1",
      });
      await service.shellSession({
        directory: "/work/a",
        sessionID: "s",
        agent: "build",
        model: { providerID: "openai", modelID: "gpt-4.1" },
        command: "ls",
      });
      await service.abortSession("/work/a", "s");
      await service.deleteSession("/work/a", "s");

      const paths = fetchMock.mock.calls.map((call) => (call[0] as URL).pathname);
      expect(paths).toEqual([
        "/session/s/command",
        "/session/s/summarize",
        "/session/s/shell",
        "/session/s/abort",
        "/session/s",
      ]);
    });

    it("replies to permissions and questions and rejects a question", async () => {
      fetchMock.mockResolvedValue(jsonResponse(204));
      const service = makeService();

      await service.replyPermission("/work/a", "perm-1", "always");
      await service.replyQuestion("/work/a", "q-1", [["yes"]]);
      await service.rejectQuestion("/work/a", "q-1");

      const paths = fetchMock.mock.calls.map((call) => (call[0] as URL).pathname);
      expect(paths).toEqual([
        "/permission/perm-1/reply",
        "/question/q-1/reply",
        "/question/q-1/reject",
      ]);
    });

    it("treats a non-JSON 2xx response as success (true)", async () => {
      fetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
      const service = makeService();
      // deleteSession resolves without throwing when the body isn't JSON.
      await expect(service.deleteSession("/work/a", "s")).resolves.toBeUndefined();
    });

    it("remaps a 404 from OpenCode's reply/reject endpoints to NotFoundError", async () => {
      fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
      const service = makeService();

      await expect(service.replyPermission("/work/a", "perm-1", "once")).rejects.toMatchObject({
        code: "not_found",
        statusCode: 404,
      });
      await expect(service.replyQuestion("/work/a", "q-1", [["yes"]])).rejects.toMatchObject({
        code: "not_found",
        statusCode: 404,
      });
      await expect(service.rejectQuestion("/work/a", "q-1")).rejects.toMatchObject({
        code: "not_found",
        statusCode: 404,
      });
    });

    it("leaves non-404 failures from reply/reject endpoints unchanged", async () => {
      fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
      const service = makeService();

      await expect(service.replyPermission("/work/a", "perm-1", "once")).rejects.toMatchObject({
        name: "OpenCodeRequestError",
        status: 500,
      });
    });
  });

  describe("mcp runtime endpoints over fetch", () => {
    it("lists MCP status and tool ids", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { srv: { status: "connected" } }));
      const service = makeService();
      const status = await service.listMcpStatus("/work/a");
      expect(status["srv"]).toBeDefined();

      fetchMock.mockResolvedValueOnce(jsonResponse(200, ["srv_tool_a", "srv_tool_b"]));
      await expect(service.listMcpToolIds("/work/a")).resolves.toEqual([
        "srv_tool_a",
        "srv_tool_b",
      ]);
    });

    it("starts, completes, authenticates, and removes MCP auth", async () => {
      const service = makeService();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { authorizationUrl: "https://x" }));
      await service.startMcpAuth("/work/a", "srv");

      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "connected" }));
      await service.completeMcpAuth("/work/a", "srv", "code-123");

      fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "connected" }));
      await service.authenticateMcp("/work/a", "srv");

      fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
      await service.removeMcpAuth("/work/a", "srv");

      const methods = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).method);
      expect(methods).toEqual(["POST", "POST", "POST", "DELETE"]);
    });

    it("disconnects a provider and rejects on failure", async () => {
      const service = makeService();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, true));
      await expect(service.disconnectProvider("/work/a", "openai")).resolves.toBe(true);
      const url = fetchMock.mock.calls[0]?.[0] as URL;
      expect(url.pathname).toBe("/auth/openai");
      expect(url.searchParams.get("directory")).toBe("/work/a");

      fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
      await expect(service.disconnectProvider("/work/a", "openai")).rejects.toThrow(
        "Failed to disconnect provider openai",
      );
    });

    it("returns true for a non-JSON disconnect response", async () => {
      const service = makeService();
      fetchMock.mockResolvedValueOnce(new Response("done", { status: 200 }));
      await expect(service.disconnectProvider("/work/a", "openai")).resolves.toBe(true);
    });
  });

  describe("scoped client methods", () => {
    afterEach(() => scopedClientMock.create.mockReset());

    it("disposes a directory-scoped instance, swallowing errors", async () => {
      const dispose = vi.fn().mockRejectedValue(new Error("boom"));
      scopedClientMock.create.mockReturnValue({ instance: { dispose } });
      const service = makeService();
      await expect(service.dispose("/work/a")).resolves.toBeUndefined();
      expect(dispose).toHaveBeenCalledOnce();
    });

    it("lists providers from the scoped client", async () => {
      scopedClientMock.create.mockReturnValue({
        provider: {
          list: vi.fn().mockResolvedValue({
            all: [{ id: "openai", name: "OpenAI", source: "api", models: {} }],
            default: {},
            connected: ["openai"],
          }),
        },
      });
      const service = makeService();
      const providers = await service.listProviders("/work/a");
      expect(providers.connected).toEqual(["openai"]);
    });

    it("falls back to config.providers when provider.list throws", async () => {
      scopedClientMock.create.mockReturnValue({
        provider: { list: vi.fn().mockRejectedValue(new Error("unsupported")) },
        config: {
          providers: vi.fn().mockResolvedValue({
            providers: [{ id: "anthropic", name: "Anthropic", source: "api", models: {} }],
            default: {},
          }),
        },
      });
      const service = makeService();
      const providers = await service.listProviders("/work/a");
      expect(providers.all).toHaveLength(1);
      expect(providers.connected).toEqual(["anthropic"]);
    });

    it("lists auth methods, sets api keys, and runs the oauth handshake", async () => {
      scopedClientMock.create.mockReturnValue({
        provider: {
          auth: vi.fn().mockResolvedValue({ openai: [{ type: "api", label: "API Key" }] }),
          oauth: {
            authorize: vi
              .fn()
              .mockResolvedValue({ url: "https://auth", method: "code", instructions: "open it" }),
            callback: vi.fn().mockResolvedValue(true),
          },
        },
        auth: { set: vi.fn().mockResolvedValue(true) },
      });
      const service = makeService();

      await expect(service.listAuthMethods("/work/a")).resolves.toBeDefined();
      await expect(service.setApiKey("/work/a", "openai", "sk-1")).resolves.toBe(true);
      await expect(service.startOauth("/work/a", "openai", 0)).resolves.toMatchObject({
        url: "https://auth",
      });
      await expect(service.completeOauth("/work/a", "openai", 0, "code")).resolves.toBe(true);
    });
  });
});
