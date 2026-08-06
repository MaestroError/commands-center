import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AppDb } from "../../../src/db/client";
import { agents } from "../../../src/db/schema/index";
import { createLogger } from "../../../src/lib/logger";
import { createCcManagedMcpAuthStateStore } from "../../../src/mcp/cc-managed/auth-state-store";
import { createCcManagedMcpAuthTokenService } from "../../../src/mcp/cc-managed/auth-token-service";
import { createCcManagedMcpService } from "../../../src/mcp/cc-managed/service";
import type { CcManagedMcpServerDefinition } from "../../../src/mcp/cc-managed/server-registry";
import { withStreamKeepalive } from "../../../src/mcp/cc-managed/stream-keepalive";
import { createTestDatabase } from "../../helpers/db";

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (disposers.length > 0) {
    await disposers.pop()?.();
  }
  vi.useRealTimers();
});

describe("withStreamKeepalive", () => {
  it("beats until the action settles, then stops", async () => {
    vi.useFakeTimers();
    const sendNotification = vi.fn((_notification: { method: string }) => Promise.resolve());
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });

    const call = withStreamKeepalive(sendNotification, () => pending, 1_000);

    await vi.advanceTimersByTimeAsync(3_500);
    expect(sendNotification).toHaveBeenCalledTimes(3);
    expect(sendNotification.mock.calls[0]?.[0]).toMatchObject({ method: "notifications/message" });

    release("done");
    await expect(call).resolves.toBe("done");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sendNotification).toHaveBeenCalledTimes(3);
  });

  it("stops beating once the client is gone, without failing the call", async () => {
    vi.useFakeTimers();
    // The transport throws "No connection established for request ID" once the
    // stream is torn down; a dead heartbeat must not take the tool call with it.
    const sendNotification = vi.fn(() => Promise.reject(new Error("no connection")));
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });

    const call = withStreamKeepalive(sendNotification, () => pending, 1_000);
    await vi.advanceTimersByTimeAsync(3_500);

    // One failed beat is enough to stand the heartbeat down.
    expect(sendNotification).toHaveBeenCalledTimes(1);

    release("ok");
    await expect(call).resolves.toBe("ok");
  });

  it("runs the action unchanged when the transport cannot send notifications", async () => {
    await expect(withStreamKeepalive(undefined, () => Promise.resolve("ok"), 1)).resolves.toBe(
      "ok",
    );
  });
});

describe("cc-managed MCP keepalive over a real client", () => {
  // Bun (the runtime opencode ships) aborts a fetch whose response body has been
  // silent for 300s, which is how a slow operator review turned into
  // "-32001 Request timed out" for work that had actually succeeded. This drives
  // the real SDK client over a real socket to prove the beats reach it while a
  // tool is still blocked.
  it("delivers notifications while a tool call is still blocked", async () => {
    const testDb = await createTestDatabase();
    disposers.push(() => testDb.cleanup());
    const slug = "keepalive-specialist";
    await insertAgent(testDb.client.db, slug);

    let releaseTool: () => void = () => {};
    const toolBlocked = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });

    const definition: CcManagedMcpServerDefinition = {
      name: "cc_default_interactive",
      routeSegment: "cc-default-interactive",
      description: "Test group",
      enabledByDefault: true,
      companionPromptId: null,
      interactive: true,
      catalogTools: [],
      tools: [
        {
          name: "blocking_tool",
          description: "Blocks until the operator acts.",
          context: "chat",
          inputSchema: z.object({}).strict(),
          execute: async () => {
            await toolBlocked;
            return { content: [{ type: "text" as const, text: "released" }] };
          },
        },
      ],
    };

    const service = createCcManagedMcpService({
      db: testDb.client.db,
      config: testDb.config,
      logger: createLogger(testDb.config),
      registry: [definition],
      keepaliveIntervalMs: 25,
    });

    const httpServer = createServer((request, response) => {
      void service.handlePost({
        rawRequest: request,
        rawReply: response,
        routeServerName: "cc-default-interactive",
        routeAgentSlug: slug,
      });
    });
    await listen(httpServer);
    disposers.push(() => close(httpServer));
    const port = (httpServer.address() as AddressInfo).port;

    const token = await createCcManagedMcpAuthTokenService({
      authStateStore: createCcManagedMcpAuthStateStore(testDb.config),
    }).issueToken(slug, "cc_default_interactive");

    const client = new Client({ name: "keepalive-test", version: "1.0.0" });
    disposers.push(() => client.close());
    const notifications: string[] = [];
    let sawBeats: () => void = () => {};
    const beating = new Promise<void>((resolve) => {
      sawBeats = resolve;
    });
    client.fallbackNotificationHandler = (notification) => {
      notifications.push(notification.method);
      if (notifications.length >= 2) {
        sawBeats();
      }
      return Promise.resolve();
    };

    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${String(port)}/`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );

    const call = client.callTool({ name: "blocking_tool", arguments: {} });

    // Beats must arrive while the call is still outstanding — that is the whole
    // point; bytes after the result would not have kept the socket alive.
    await beating;
    expect(notifications.every((method) => method === "notifications/message")).toBe(true);

    releaseTool();
    const result = await call;
    expect((result.content as Array<{ text?: string }>)[0]?.text).toBe("released");
  });
});

async function insertAgent(db: AppDb, slug: string): Promise<void> {
  const timestamp = new Date();
  await db.insert(agents).values({
    id: `agent-${randomUUID()}`,
    slug,
    name: "Keepalive Specialist",
    role: "wait",
    instructions: "Wait.",
    default_model: "openai/gpt-4.1",
    icon_path: null,
    status: "active",
    capabilities_json: "{}",
    created_at: timestamp,
    updated_at: timestamp,
    archived_at: null,
  });
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
