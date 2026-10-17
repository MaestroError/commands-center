import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { mcp_servers } from "../../src/db/schema/mcp-servers.js";
import {
  buildEmbeddedMcpDefinitions,
  syncEmbeddedGlobalMcpConfig,
} from "../../src/opencode/embedded-mcp-config.js";
import { renderEmbeddedWorkspace } from "../../src/opencode/embedded-workspace-config.js";
import { createEmbeddedMcpOAuthCallbacks } from "../../src/opencode/embedded-mcp-oauth-callbacks.js";
import { buildEmbeddedTaskPermissions } from "../../src/opencode/embedded-task-permissions.js";
import { createTestDatabase } from "../helpers/db.js";

describe("embedded MCP configuration producers", () => {
  let db: Awaited<ReturnType<typeof createTestDatabase>>;
  beforeAll(async () => {
    db = await createTestDatabase();
    await db.client.db.insert(mcp_servers).values([
      {
        id: "local",
        name: "local",
        transport: "stdio",
        enabled: true,
        config_json: JSON.stringify({
          transport: "stdio",
          command: ["node", "server.js"],
          environment: { TOKEN: "{env:MY_TOKEN}" },
        }),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "remote",
        name: "remote",
        transport: "streamable-http",
        enabled: false,
        config_json: JSON.stringify({
          transport: "streamable-http",
          url: "https://example.com/mcp",
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer {env:REMOTE_TOKEN}" }],
        }),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "oauth",
        name: "oauth",
        transport: "sse",
        enabled: true,
        config_json: JSON.stringify({
          transport: "sse",
          url: "https://example.com/oauth-mcp",
          authMethod: "oauth",
          headers: [],
        }),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  });
  afterAll(async () => db.cleanup());
  it("preserves stdio commands and secret references", async () => {
    expect((await buildEmbeddedMcpDefinitions(db.client.db, db.config))["local"]).toMatchObject({
      type: "local",
      command: ["node", "server.js"],
      environment: { TOKEN: "{env:MY_TOKEN}" },
    });
  });
  it("preserves remote header references without enabling OAuth", async () => {
    expect((await buildEmbeddedMcpDefinitions(db.client.db, db.config))["remote"]).toMatchObject({
      disabled: true,
      oauth: false,
      headers: { Authorization: "Bearer {env:REMOTE_TOKEN}" },
    });
  });
  it("generates separate public redirects and private callback ports", async () => {
    const callbacks = createEmbeddedMcpOAuthCallbacks("https://cc.example.test");
    try {
      const definitions = await buildEmbeddedMcpDefinitions(db.client.db, db.config, {}, callbacks);
      expect(definitions["oauth"]).toMatchObject({
        oauth: {
          redirect_uri: "https://cc.example.test/api/mcp-servers/oauth/auth/redirect",
          callback_port: expect.any(Number),
        },
      });
    } finally {
      callbacks.dispose();
    }
  });
  it("uses native SDK OAuth without claiming CC's callback port", async () => {
    expect((await buildEmbeddedMcpDefinitions(db.client.db, db.config))["oauth"]).toMatchObject({
      oauth: {},
    });
  });
  it("retains the managed tool execution timeout", async () => {
    const definitions = await buildEmbeddedMcpDefinitions(db.client.db, db.config, {
      cc_default: {
        type: "remote",
        url: "http://127.0.0.1:4100/mcp",
        enabled: true,
        oauth: false,
        timeout: 600000,
        headers: { Authorization: "Bearer test" },
      },
    });
    expect(definitions["cc_default"]?.timeout).toEqual({ execution: 600000 });
  });
  it("rejects external names that collide with managed servers", async () => {
    await expect(
      buildEmbeddedMcpDefinitions(db.client.db, db.config, {
        local: { type: "remote", url: "http://127.0.0.1:4100/mcp", enabled: true },
      }),
    ).rejects.toThrow("reserved by CC");
  });
  it("keeps default-enabled managed servers active without an explicit selection", async () => {
    const entries = {
      cc_default: { type: "remote" as const, url: "http://127.0.0.1:4100/mcp", enabled: true },
    };
    const result = renderEmbeddedWorkspace(
      {
        name: "Test",
        role: "Tester",
        instructions: "Test",
        defaultModel: "test/test",
        capabilities: {},
        appMcpEntries: entries,
      },
      await buildEmbeddedMcpDefinitions(db.client.db, db.config, entries),
    );
    expect(JSON.parse(result.configJsonc)).toMatchObject({
      mcp: { servers: { cc_default: { disabled: false }, local: { disabled: true } } },
    });
  });
  it("preserves other native settings when writing global MCP configuration", async () => {
    const path = join(db.config.paths.workspaceDir, "opencode.jsonc");
    await writeFile(path, JSON.stringify({ model: "test/test", plugins: ["./plugin"] }));
    await syncEmbeddedGlobalMcpConfig(db.client.db, db.config);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      model: "test/test",
      plugins: ["./plugin"],
      mcp: { servers: { local: { codemode: false } } },
    });
  });
  it("refuses to overwrite malformed global configuration", async () => {
    const path = join(db.config.paths.workspaceDir, "opencode.jsonc");
    await writeFile(path, "invalid JSON");
    await expect(syncEmbeddedGlobalMcpConfig(db.client.db, db.config)).rejects.toThrow();
  });
});

describe("native task permissions", () => {
  it("preserves native permission action names", () => {
    expect(
      buildEmbeddedTaskPermissions({ toolPermissions: [{ pattern: "shell", action: "deny" }] }),
    ).toContainEqual({ permission: "shell", pattern: "*", action: "deny" });
  });
  it("keeps disabled server denials after per-tool grants", () => {
    const rules = buildEmbeddedTaskPermissions({
      mcpServers: [{ name: "test", enabled: false, action: "allow" }],
      toolPermissions: [{ pattern: "test_run", action: "allow" }],
    });
    expect(rules.at(-2)).toEqual({ permission: "test_*", pattern: "*", action: "deny" });
  });
  it("denies unattended question prompts after wildcard grants", () => {
    expect(buildEmbeddedTaskPermissions({ approvalPolicy: "auto_approve" }).at(-1)).toEqual({
      permission: "question",
      pattern: "*",
      action: "deny",
    });
  });
});
