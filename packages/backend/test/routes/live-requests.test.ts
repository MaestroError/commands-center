import { describe, expect, it, vi } from "vitest";

import { createLiveRequestService } from "../../src/services/live-request-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createLogger } from "../../src/lib/logger";
import { createServer } from "../../src/server";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import type { OpenCodeEventService } from "../../src/services/opencode-event-service";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createTestDatabase } from "../helpers/db";

describe("live request routes", () => {
  it("resolves a pending live request", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = createLiveRequestService();
    const server = await createRouteServer({
      testDb,
      liveRequestService,
    });
    const controller = new AbortController();
    const requestId = createPendingRequestId(liveRequestService, controller, "conv-1");
    const pending = liveRequestService.create({
      conversationId: "conv-1",
      kind: "add-secret",
      closable: false,
      presentation: { title: "Add secret", cancelLabel: "Cancel" },
      fields: [{ type: "text", name: "key", label: "Key", required: true }],
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: `/api/conversations/conv-1/live-requests/${requestId()}/resolve`,
        payload: { action: "submit", values: { key: "API_TOKEN" } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      await expect(pending).resolves.toEqual({
        action: "submit",
        values: { key: "API_TOKEN" },
      });
    } finally {
      controller.abort();
      liveRequestService.dispose();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("cancels a pending live request", async () => {
    const testDb = await createTestDatabase();
    const liveRequestService = createLiveRequestService();
    const server = await createRouteServer({
      testDb,
      liveRequestService,
    });
    const controller = new AbortController();
    const requestId = createPendingRequestId(liveRequestService, controller, "conv-2");
    const pending = liveRequestService.create({
      conversationId: "conv-2",
      kind: "rename-agent",
      closable: true,
      presentation: { title: "Rename agent", cancelLabel: "Cancel" },
      fields: [{ type: "text", name: "name", label: "Name", required: true }],
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: `/api/conversations/conv-2/live-requests/${requestId()}/cancel`,
        payload: { reason: "User cancelled" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      await expect(pending).rejects.toThrow("User cancelled");
    } finally {
      controller.abort();
      liveRequestService.dispose();
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 when resolving without a live request service", async () => {
    const testDb = await createTestDatabase();
    const server = await createRouteServer({ testDb });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/conversations/conv-1/live-requests/req-1/resolve",
        payload: { values: { key: "API_TOKEN" } },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: "not_found", message: "Live request not found." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("returns 404 when cancelling without a live request service", async () => {
    const testDb = await createTestDatabase();
    const server = await createRouteServer({ testDb });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/conversations/conv-1/live-requests/req-1/cancel",
        payload: { reason: "no-op" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: { code: "not_found", message: "Live request not found." },
      });
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

async function createRouteServer(options: {
  testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  liveRequestService?: ReturnType<typeof createLiveRequestService>;
}) {
  return createServer({
    config: options.testDb.config,
    logger: createLogger(options.testDb.config),
    database: options.testDb.client,
    orchestrator: createMockOrchestrator(),
    opencodeService: createMockOpenCodeService(),
    openCodeEventService: createMockOpenCodeEventService(),
    secretService: createSecretService({
      db: options.testDb.client.db,
      config: options.testDb.config,
    }),
    liveRequestService: options.liveRequestService,
    scheduler: createSchedulerService(),
  });
}

function createPendingRequestId(
  service: ReturnType<typeof createLiveRequestService>,
  controller: AbortController,
  conversationId: string,
) {
  let requestId: string | undefined;

  service.subscribe({
    conversationId,
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === "cc.live_request.opened") {
        requestId = event.properties.request.id;
      }
    },
  });

  return () => {
    if (!requestId) {
      throw new Error("Expected live request to be opened.");
    }

    return requestId;
  };
}

function createMockOrchestrator(): OpenCodeOrchestrator {
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

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: vi.fn(),
    disposeGlobal: vi.fn(),
  } as unknown as OpenCodeService;
}

function createMockOpenCodeEventService(): OpenCodeEventService {
  return {
    subscribe: vi.fn(),
  } as unknown as OpenCodeEventService;
}
