import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";

import type { OpencodeClient } from "../../src/lib/opencode-client.js";
import type { RuntimeConfig } from "../../src/lib/runtime-config.js";
import { createOpenCodeService } from "../../src/services/opencode-service.js";

const BASE_URL = "http://opencode.test:1234";

function createConfig(): RuntimeConfig {
  return { opencode: { baseUrl: BASE_URL } } as unknown as RuntimeConfig;
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
});
