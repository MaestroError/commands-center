import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import { createApiTokenService } from "../../src/services/api-token-service";
import { createLogger } from "../../src/lib/logger";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeService } from "../../src/services/opencode-service";
import type { RuntimeContext } from "../../src/lib/start-server-runtime";
import { createTestDatabase } from "../helpers/db";

function orchestrator(): OpenCodeOrchestrator {
  return {
    getStatus: () => ({
      state: "healthy",
      healthy: true,
      url: "http://localhost:4100",
      workspaceDir: "/test",
      restartCount: 0,
      maxRestarts: 3,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    refreshHealth: vi.fn().mockResolvedValue(true),
  };
}

const disposers: Array<() => Promise<void>> = [];

beforeEach(() => {
  // /pty listing always resolves to an empty session list.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
});

async function bootServer(extra: Partial<RuntimeContext> = {}) {
  const testDb = await createTestDatabase();
  const server = await createServer({
    config: testDb.config,
    logger: createLogger(testDb.config),
    database: testDb.client,
    apiTokenService: createApiTokenService({ db: testDb.client.db }),
    orchestrator: orchestrator(),
    opencodeService: {} as OpenCodeService,
    openCodeEventService: { subscribe: () => {} },
    secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
    scheduler: createSchedulerService(),
    ...extra,
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  const port = (server.server.address() as AddressInfo).port;
  disposers.push(async () => {
    await server.close();
    await testDb.cleanup();
  });
  return { server, port };
}

function connectStatus(url: string, headers?: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, headers ? { headers } : undefined);
    ws.on("unexpected-response", (_req: unknown, res: IncomingMessage) => {
      resolve(res.statusCode ?? 0);
      ws.terminate();
    });
    ws.on("open", () => {
      ws.close();
      reject(new Error("expected the upgrade to be rejected"));
    });
    ws.on("error", (error) => {
      // Some rejections surface as a socket error rather than unexpected-response.
      reject(error);
    });
  });
}

describe("terminal websocket upgrade", () => {
  it("returns 404 for an unknown terminal session when auth is not required", async () => {
    const { port } = await bootServer();
    await expect(
      connectStatus(`ws://127.0.0.1:${port}/api/terminal/unknown/connect`),
    ).resolves.toBe(404);
  });

  it("returns 401 when owner auth is required and no session cookie is present", async () => {
    const ownerAccessService = {
      validateSession: vi.fn().mockResolvedValue(false),
    } as unknown as RuntimeContext["ownerAccessService"];
    const { port } = await bootServer({ ownerAccessService });
    await expect(
      connectStatus(`ws://127.0.0.1:${port}/api/terminal/unknown/connect`),
    ).resolves.toBe(401);
  });

  it("authorizes a valid owner session cookie, then 404s for the unknown session", async () => {
    const ownerAccessService = {
      validateSession: vi.fn().mockResolvedValue(true),
    } as unknown as RuntimeContext["ownerAccessService"];
    const { port } = await bootServer({ ownerAccessService });
    await expect(
      connectStatus(`ws://127.0.0.1:${port}/api/terminal/unknown/connect`, {
        origin: "http://localhost:3000",
        cookie: "cc_owner_session=valid-session-id",
      }),
    ).resolves.toBe(404);
  });

  it("upgrades the connection and relays PTY output for an existing session", async () => {
    const openSockets: FakePtySocket[] = [];
    class FakePtySocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number }) => void) | null = null;
      sent: string[] = [];
      constructor() {
        openSockets.push(this);
        queueMicrotask(() => this.onopen?.());
      }
      send(data: string) {
        this.sent.push(data);
      }
      close() {
        this.onclose?.({ code: 0 });
      }
    }
    vi.stubGlobal("WebSocket", FakePtySocket as never);
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: URL | string, init?: { method?: string }) => {
        const body =
          init?.method === "POST" ? { id: "pty-1", cwd: "/work" } : [{ id: "pty-1", cwd: "/work" }];
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const { server, port } = await bootServer();
    // Create the session so the backend tracks it for attach().
    await server.inject({ method: "POST", url: "/api/terminal", payload: {} });

    const client = new WebSocket(`ws://127.0.0.1:${port}/api/terminal/pty-1/connect`);
    try {
      const received = await new Promise<string>((resolve, reject) => {
        client.on("open", () => {
          client.send("ls\n");
          openSockets[0]?.onmessage?.({ data: "file-a\n" });
        });
        client.on("message", (data: Buffer) => resolve(data.toString("utf8")));
        client.on("error", reject);
      });

      expect(received).toBe("file-a\n");
      // The client's keystroke is forwarded to the PTY socket (arrives asynchronously).
      await vi.waitFor(() => expect(openSockets[0]?.sent).toContain("ls\n"));
    } finally {
      client.terminate();
    }
  });
});
