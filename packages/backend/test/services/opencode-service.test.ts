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

      service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      const url = fetchMock.mock.calls[0]?.[0] as URL;
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;

      expect(url.pathname).toBe("/session/sess-1/prompt_async");
      expect(url.searchParams.get("directory")).toBe("/work/agent-a");
      expect(init.method).toBe("POST");
    });

    it("does not throw when the underlying request rejects", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));
      const logger = createLogger();
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger,
      });

      service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
      });

      await vi.waitFor(() => {
        expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled();
      });
    });

    it("logs upstream non-2xx responses without throwing", async () => {
      fetchMock.mockResolvedValue(new Response("server is sad", { status: 500 }));
      const logger = createLogger();
      const service = createOpenCodeService({
        client: FAKE_CLIENT,
        config: createConfig(),
        logger,
      });

      service.promptSessionAsync({
        directory: "/work/agent-a",
        sessionID: "sess-1",
        agent: "build",
        model: { providerID: "anthropic", modelID: "claude" },
        text: "hello",
      });

      await vi.waitFor(() => {
        expect((logger as unknown as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled();
      });
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
      fetchMock.mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      );
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
});
