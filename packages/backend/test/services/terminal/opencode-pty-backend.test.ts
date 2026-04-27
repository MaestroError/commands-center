import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "pino";
import type { RuntimeConfig } from "../../../src/lib/runtime-config.js";
import { createOpenCodePtyBackend } from "../../../src/services/terminal/opencode-pty-backend.js";

const BASE_URL = "http://opencode.test:4100";

function createConfig(): RuntimeConfig {
  return {
    opencode: { baseUrl: BASE_URL },
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
  } as unknown as Logger & { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
}

function jsonResponse(status = 200, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? undefined : { "Content-Type": "application/json" },
  });
}

describe("OpenCodePtyBackend", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof createLogger>;
  let config: ReturnType<typeof createConfig>;
  let backend: ReturnType<typeof createOpenCodePtyBackend>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    let wsInstance: {
      onopen: (() => void) | null;
      onerror: ((err: Error) => void) | null;
      onmessage: ((event: { data: string }) => void) | null;
      onclose: ((event: { code: number }) => void) | null;
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      readyState: number;
    };

    vi.stubGlobal(
      "WebSocket",
      vi.fn().mockImplementation(() => {
        wsInstance = {
          onopen: null,
          onerror: null,
          onmessage: null,
          onclose: null,
          send: vi.fn(),
          close: vi.fn(),
          readyState: 0,
        };
        setTimeout(() => {
          if (wsInstance.onopen) {
            wsInstance.onopen();
          }
        }, 0);
        return wsInstance;
      }),
    );

    logger = createLogger();
    config = createConfig();
    backend = createOpenCodePtyBackend({ config, logger });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("create", () => {
    it("creates a PTY session via OpenCode API", async () => {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValue(jsonResponse(201, mockSession));

      const result = await backend.create({ cwd: "/home/user" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [url, init] = firstCall!;
      expect(String(url)).toBe(`${BASE_URL}/pty`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        cwd: "/home/user",
        shell: "/bin/bash",
      });
      expect(result).toMatchObject({
        id: mockSession.id,
        backend: mockSession.backend,
        cwd: mockSession.cwd,
      });
      expect(result.createdAt).toEqual(expect.any(Number));
    });

    it("uses default shell when not specified", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(201, {
          id: "pty-123",
          backend: "opencode",
          cwd: "/home/user",
          createdAt: Date.now(),
        }),
      );

      await backend.create({});

      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [, init] = firstCall!;
      expect(JSON.parse(init.body as string).shell).toBe("/bin/bash");
    });

    it("throws when API returns error", async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, { error: "Internal error" }));

      await expect(backend.create({})).rejects.toThrow("Failed to create PTY session: 500");
    });
  });

  describe("attach", () => {
    it("creates WebSocket connection to session", async () => {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValue(jsonResponse(201, mockSession));

      const session = await backend.create({});
      const handle = await backend.attach(session.id);

      expect(globalThis.WebSocket).toHaveBeenCalledWith(
        expect.objectContaining({ href: `${BASE_URL}/pty/${session.id}/connect` }),
      );
      expect(handle).toBeDefined();
      expect(typeof handle.write).toBe("function");
      expect(typeof handle.resize).toBe("function");
      expect(typeof handle.onData).toBe("function");
      expect(typeof handle.onExit).toBe("function");
      expect(typeof handle.close).toBe("function");
    });

    it("throws when session not found", async () => {
      await expect(backend.attach("non-existent")).rejects.toThrow(
        "Session not found: non-existent",
      );
    });
  });

  describe("resize", () => {
    it("updates PTY size via OpenCode API", async () => {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(201, mockSession));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, mockSession));

      const session = await backend.create({});
      await expect(backend.resize(session.id, 80, 24)).resolves.toBeUndefined();

      const resizeCall = fetchMock.mock.calls[1];
      expect(resizeCall).toBeDefined();
      const [url, init] = resizeCall!;
      expect(String(url)).toBe(`${BASE_URL}/pty/${session.id}`);
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body as string)).toEqual({ size: { cols: 80, rows: 24 } });
    });
  });

  describe("close", () => {
    it("closes session and removes from cache", async () => {
      const mockSession = {
        id: "pty-123",
        backend: "opencode",
        cwd: "/home/user",
        createdAt: Date.now(),
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(201, mockSession));
      fetchMock.mockResolvedValueOnce(jsonResponse(200, true));

      const session = await backend.create({});
      await backend.close(session.id);

      expect(logger.info).toHaveBeenCalledWith(
        { sessionId: session.id },
        "Closed OpenCode PTY session",
      );
    });
  });

  describe("list", () => {
    it("returns sessions from OpenCode API", async () => {
      const mockSessions = [
        { id: "pty-1", cwd: "/home/user", createdAt: 1000 },
        { id: "pty-2", cwd: "/home/admin", createdAt: 2000 },
      ];
      fetchMock.mockResolvedValue(jsonResponse(200, mockSessions));

      const result = await backend.list();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCall = fetchMock.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [url] = firstCall!;
      expect(String(url)).toBe(`${BASE_URL}/pty`);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: "pty-1", backend: "opencode", cwd: "/home/user" });
      expect(result[1]).toMatchObject({ id: "pty-2", backend: "opencode", cwd: "/home/admin" });
      expect(result[0]?.createdAt).toEqual(expect.any(Number));
      expect(result[1]?.createdAt).toEqual(expect.any(Number));
    });

    it("returns empty array on API failure", async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));

      const result = await backend.list();

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("isAvailable", () => {
    it("returns true", () => {
      expect(backend.isAvailable()).toBe(true);
    });
  });

  describe("type", () => {
    it("returns opencode", () => {
      expect(backend.type).toBe("opencode");
    });
  });
});
