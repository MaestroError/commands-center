import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLogger } from "../../src/lib/logger";
import type { OpenCodeOrchestrator } from "../../src/orchestrator/opencode-orchestrator";
import { createServer } from "../../src/server";
import type { OpenCodeService } from "../../src/services/opencode-service";
import { createSchedulerService } from "../../src/services/scheduler-service";
import { createSecretService } from "../../src/services/secret-service";
import { createTestDatabase } from "../helpers/db";

describe("cc-managed MCP routes", () => {
  it("serves the cc_app MCP endpoint with agent-scoped auth", async () => {
    const testDb = await createTestDatabase();
    testDb.config.server.port = 43123;
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      await server.listen({ host: "127.0.0.1", port: testDb.config.server.port });

      const created = await server.inject({
        method: "POST",
        url: "/api/agents",
        payload: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          capabilities: {
            builtInSkills: [],
            workspaceSkills: [],
            customTools: [],
            mcpServers: [],
            toolPermissions: [],
            appMcpServers: [{ name: "cc_app", enabled: true, action: "allow" }],
            appToolPermissions: [],
          },
        },
      });

      expect(created.statusCode).toBe(201);
      const agent = created.json<{ workspacePath: string }>();
      const config = JSON.parse(
        await readFile(join(agent.workspacePath, "opencode.jsonc"), "utf8"),
      ) as {
        mcp: Record<string, { url: string; headers: Record<string, string> }>;
      };
      const ccApp = config.mcp["cc_app"];

      expect(ccApp).toBeDefined();
      expect(ccApp?.url).toContain("/api/mcp/cc/cc-app/agents/writer");
      expect(ccApp?.headers["Authorization"]).toContain("Bearer ");

      if (!ccApp) {
        throw new Error("Expected cc_app config entry.");
      }

      const authHeader = ccApp.headers["Authorization"];

      if (!authHeader) {
        throw new Error("Expected cc_app authorization header.");
      }

      const initializeResponse = await fetch(ccApp.url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }),
      });

      expect(initializeResponse.ok).toBe(true);

      const initializeBody = await initializeResponse.text();

      expect(initializeResponse.headers.get("mcp-session-id")).toBeTruthy();
      expect(initializeBody).toContain('"name":"cc_app"');
      expect(initializeBody).toContain('"listChanged":true');

      const sessionId = initializeResponse.headers.get("mcp-session-id");

      const listToolsResponse = await fetch(ccApp.url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      });

      expect(listToolsResponse.ok).toBe(true);
      const listToolsBody = await listToolsResponse.text();

      expect(listToolsBody).toContain('"name":"create_custom_ts_tool"');

      const callToolResponse = await fetch(ccApp.url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          Accept: "application/json, text/event-stream",
          "content-type": "application/json",
          ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "create_custom_ts_tool",
            arguments: {
              name: "Release Helper",
              description: "Draft release notes.",
            },
          },
        }),
      });

      expect(callToolResponse.ok).toBe(true);
      const callToolJson = parseSseJson(await callToolResponse.text()) as {
        result?: {
          structuredContent?: {
            toolSlug?: string;
            directoryPath?: string;
            entryPath?: string;
          };
        };
      };

      expect(callToolJson.result?.structuredContent?.toolSlug).toBe("release-helper");
      expect(callToolJson.result?.structuredContent?.directoryPath).toContain(
        "/custom-tools/release-helper",
      );
      expect(callToolJson.result?.structuredContent?.entryPath).toContain(
        "/custom-tools/release-helper/tool.ts",
      );
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });

  it("rejects missing bearer auth for cc_app", async () => {
    const testDb = await createTestDatabase();
    const server = await createServer({
      config: testDb.config,
      logger: createLogger(testDb.config),
      database: testDb.client,
      orchestrator: createOrchestrator(),
      opencodeService: createMockOpenCodeService(),
      openCodeEventService: { subscribe: () => {} },
      secretService: createSecretService({ db: testDb.client.db, config: testDb.config }),
      scheduler: createSchedulerService(),
    });

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/mcp/cc/cc-app/agents/writer",
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.body).toContain("Missing bearer token");
    } finally {
      await server.close();
      await testDb.cleanup();
    }
  });
});

function parseSseJson(body: string): unknown {
  const dataLine = body
    .split("\n")
    .find(
      (line) => line.startsWith("data: ") && line.slice("data: ".length).trim().startsWith("{"),
    );

  if (!dataLine) {
    throw new Error(`Expected SSE data line in response: ${body}`);
  }

  return JSON.parse(dataLine.slice("data: ".length));
}

function createOrchestrator(): OpenCodeOrchestrator {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
  };
}

function createMockOpenCodeService(): OpenCodeService {
  return {
    dispose: () => Promise.resolve(),
    disposeGlobal: () => Promise.resolve(),
    listProviders: () => Promise.resolve({ all: [], default: {}, connected: [] }),
    listAuthMethods: () => Promise.resolve({}),
    setApiKey: () => Promise.resolve(true),
    startOauth: () =>
      Promise.resolve({
        url: "https://example.com",
        method: "auto",
        instructions: "",
      }),
    completeOauth: () => Promise.resolve(true),
    disconnectProvider: () => Promise.resolve(true),
  } as unknown as OpenCodeService;
}
