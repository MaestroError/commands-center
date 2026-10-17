import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(async () => {
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
});
