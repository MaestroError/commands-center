import { expect, test, type Page, type BrowserContext, type APIResponse } from "@playwright/test";
import {
  specialistSchema,
  taskSchema,
  taskRunSchema,
  mcpRemoteServerConfigSchema,
  mcpServerSchema,
  mcpAuthStartResultSchema,
  fileManagerFileContentResponseSchema,
} from "@cc/shared/schemas";

let ownerCookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/login");
  await page.getByTestId("owner-login-password").fill("Local-v2-test-password!");
  await page.getByTestId("owner-login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
  ownerCookies = await page.context().cookies();
  await page.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(ownerCookies);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("provider-requests", {
      body: await (await page.request.get("/api/e2e/provider-requests")).text(),
      contentType: "application/json",
    });
  }
});

async function mutate(
  page: Page,
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  data?: unknown,
): Promise<APIResponse> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "cc_csrf_token");
  const response = await page.request.fetch(url, {
    method,
    data,
    headers: { "x-csrf-token": csrf?.value ?? "", origin: "http://127.0.0.1:4176" },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response;
}

async function specialist(page: Page, name: string) {
  return specialistSchema.parse(
    await (
      await mutate(page, "POST", "/api/specialists", {
        name,
        role: "Tool tester",
        instructions: "Exercise the requested tool.",
        defaultModel: "local-e2e/test",
        capabilities: {},
      })
    ).json(),
  );
}

async function callTool(page: Page, slug: string, tool: string): Promise<void> {
  await page.goto(`/chat/${slug}`);
  await page.getByTestId("chat-message-input").fill(`CALL:${tool}`);
  await page.getByTestId("chat-send").click();
}

test("executes a CC-managed tool through browser chat", async ({ page }) => {
  const agent = await specialist(page, "Managed Browser Tool");
  await callTool(page, agent.slug, "cc_default_get_self_profile");
  try {
    await expect(page.getByText(/Local v2 tool result:.*Profile loaded/)).toBeVisible();
  } finally {
    await test.info().attach("runtime-inventory", {
      body: await (await page.request.get(`/api/e2e/specialist-runtime/${agent.slug}`)).text(),
      contentType: "application/json",
    });
  }
});

for (const decision of ["Allow Once", "Deny"] as const) {
  test(`resolves a custom-tool request with ${decision}`, async ({ page }) => {
    const name = decision === "Deny" ? "Denied Probe" : "Allowed Probe";
    const slug = name.toLowerCase().replaceAll(" ", "-");
    const agent = await specialist(page, `${name} Specialist`);
    await page.goto("/tools");
    await page.getByPlaceholder("Tool name", { exact: true }).fill(name);
    await page.getByPlaceholder("Description", { exact: true }).fill("Local browser tool probe");
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/custom-tools") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create", exact: true }).click();
    expect((await created).ok()).toBe(true);
    await mutate(page, "POST", `/api/custom-tools/${slug}/copy-to-specialists`, {
      agentIds: [agent.id],
      overwrite: false,
    });
    await mutate(page, "PATCH", `/api/specialists/${agent.id}`, {
      capabilities: {
        ...agent.capabilities,
        customTools: [slug],
        toolPermissions: [{ pattern: `cc_custom_${slug}`, action: "ask" }],
      },
    });
    await callTool(page, agent.slug, `cc_custom_${slug}`);
    await expect(page.getByText("Permission Required", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: decision, exact: true }).click();
    await expect(
      page.getByText(
        decision === "Deny"
          ? /Local v2 tool result:.*rejected/
          : /Local v2 tool result:.*Implement this tool/,
      ),
    ).toBeVisible();
  });
}

test("loads a renamed custom-tool copy after runtime reload", async ({ page }) => {
  const agent = await specialist(page, "Renamed Browser Tool");
  await mutate(page, "POST", "/api/custom-tools", { name: "Original Probe" });
  await mutate(page, "POST", "/api/custom-tools/original-probe/copy-to-specialists", {
    agentIds: [agent.id],
    destinationName: "Renamed Probe",
    overwrite: false,
  });
  await callTool(page, agent.slug, "cc_custom_renamed-probe");
  await expect(page.getByText(/Local v2 tool result:.*Implement this tool/)).toBeVisible();
});

test("completes MCP OAuth through the application callback", async ({ page }) => {
  const agent = await specialist(page, "OAuth Browser Tool");
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  const server = mcpServerSchema.parse(
    await (
      await mutate(page, "POST", "/api/mcp-servers", {
        name: "browser_oauth",
        specialistIds: [agent.id],
        config: { transport: "streamable-http", url: endpoint.url, authMethod: "oauth" },
      })
    ).json(),
  );
  const auth = mcpAuthStartResultSchema.parse(
    await (await mutate(page, "POST", `/api/mcp-servers/${server.id}/auth/start`)).json(),
  );
  await mutate(page, "POST", `/api/mcp-servers/${server.id}/auth/authenticate`);
  await page.goto(auth.authorizationUrl);
  await expect(
    page.getByText("Authorization complete. You can close this tab and return to CC."),
  ).toBeVisible();
  await mutate(page, "POST", `/api/mcp-servers/${server.id}/auth/authenticate`);
  await callTool(page, agent.slug, "browser_oauth_greet");
  await expect(page.getByText(/Local v2 tool result:.*OAuth MCP greeting/)).toBeVisible();
});

test("persists MCP assignment renames in portable specialist configuration", async ({ page }) => {
  const agent = await specialist(page, "MCP Rename Browser");
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  const config = {
    transport: "streamable-http",
    url: endpoint.url,
    authMethod: "headers",
    headers: [{ key: "Authorization", value: "Bearer test-access" }],
  };
  const server = mcpServerSchema.parse(
    await (
      await mutate(page, "POST", "/api/mcp-servers", {
        name: "before_rename",
        specialistIds: [agent.id],
        config,
      })
    ).json(),
  );
  await mutate(page, "PATCH", `/api/mcp-servers/${server.id}`, { name: "after_rename", config });
  const file = fileManagerFileContentResponseSchema.parse(
    await (
      await page.request.get("/api/file-manager/files/content", {
        params: { root: "workspace", path: `specialists/${agent.slug}/specialist.json` },
      })
    ).json(),
  );
  expect(file.content).toContain("after_rename");
  expect(file.content).not.toContain("before_rename");
  await callTool(page, agent.slug, "after_rename_greet");
  await expect(page.getByText(/Local v2 tool result:.*OAuth MCP greeting/)).toBeVisible();
});

test("removes a renamed custom-tool plugin from the running specialist", async ({ page }) => {
  const agent = await specialist(page, "Removed Browser Tool");
  await mutate(page, "POST", "/api/custom-tools", { name: "Removal Source" });
  await mutate(page, "POST", "/api/custom-tools/removal-source/copy-to-specialists", {
    agentIds: [agent.id],
    destinationName: "Removal Copy",
    overwrite: false,
  });
  await mutate(page, "DELETE", `/api/specialists/${agent.id}/custom-tools/removal-copy`);
  await callTool(page, agent.slug, "cc_custom_removal-copy");
  await expect(page.getByText(/Local v2 tool result:.*No tool named/)).toBeVisible();
});

test("disables an MCP tool in an existing conversation", async ({ page }) => {
  const agent = await specialist(page, "MCP Disabled Browser");
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  const server = mcpServerSchema.parse(
    await (
      await mutate(page, "POST", "/api/mcp-servers", {
        name: "disable_probe",
        specialistIds: [agent.id],
        config: {
          ...endpoint,
          authMethod: "headers",
          headers: [{ key: "Authorization", value: "Bearer test-access" }],
        },
      })
    ).json(),
  );
  await callTool(page, agent.slug, "disable_probe_greet");
  await expect(page.getByText(/Local v2 tool result:.*OAuth MCP greeting/)).toBeVisible();
  await mutate(page, "PATCH", `/api/mcp-servers/${server.id}/enabled`, { enabled: false });
  await callTool(page, agent.slug, "disable_probe_greet");
  await expect(page.getByText(/Local v2 tool result:.*No tool named/)).toBeVisible();
});

test("rejects external MCP names reserved for CC-managed servers", async ({ page }) => {
  await specialist(page, "Reserved MCP Browser");
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "cc_csrf_token");
  const response = await page.request.post("/api/mcp-servers", {
    headers: { "x-csrf-token": csrf?.value ?? "", origin: "http://127.0.0.1:4176" },
    data: { name: "cc_default", config: { transport: "stdio", command: ["unused"] } },
  });
  expect(response.status()).toBe(409);
});

test("creates specialist MCP tool defaults in the form", async ({ page }) => {
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  await mutate(page, "POST", "/api/mcp-servers", {
    name: "create_permissions",
    config: {
      transport: "streamable-http",
      url: endpoint.url,
      authMethod: "headers",
      headers: [{ key: "Authorization", value: "Bearer test-access" }],
    },
  });
  await mutate(page, "POST", "/api/e2e/connect-workspace-mcp", { name: "create_permissions" });
  await page.goto("/specialists/new");
  await page.getByTestId("specialist-name").fill("MCP Default Creator");
  await page.getByTestId("specialist-role").fill("Test permissions");
  await page.getByTestId("specialist-instructions").fill("Use tools when requested.");
  await page.getByRole("combobox", { name: "Model", exact: true }).fill("local-e2e/test");
  await page.getByRole("option", { name: /local-e2e\/test/ }).click();
  await page.getByRole("button", { name: "create_permissions Allow", exact: true }).click();
  await page.getByRole("button", { name: "create_permissions greet Deny", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/specialists") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create specialist", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  expect(specialistSchema.parse(await response.json()).capabilities.mcpToolPermissions).toEqual([
    { server: "create_permissions", tool: "greet", action: "deny" },
  ]);
});

test("edits a specialist MCP tool to ask and requests chat approval", async ({ page }) => {
  const agent = await specialist(page, "MCP Per Tool Approval");
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  await mutate(page, "POST", "/api/mcp-servers", {
    name: "edit_permissions",
    specialistIds: [agent.id],
    config: {
      transport: "streamable-http",
      url: endpoint.url,
      authMethod: "headers",
      headers: [{ key: "Authorization", value: "Bearer test-access" }],
    },
  });
  await page.request.get(`/api/e2e/specialist-runtime/${agent.slug}`);
  await page.goto(`/specialists/${agent.slug}/edit`);
  await page.getByRole("button", { name: "edit_permissions greet Ask", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/specialists/${agent.id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await callTool(page, agent.slug, "edit_permissions_greet");
  await expect(page.getByText("Permission Required", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Allow Once", exact: true }).click();
  await expect(page.getByText(/Local v2 tool result:.*OAuth MCP greeting/)).toBeVisible();
});

test("runs a task MCP grant over a specialist tool denial", async ({ page }) => {
  const agent = await specialist(page, "MCP Task Grant");
  const endpoint = mcpRemoteServerConfigSchema.parse(
    await (await page.request.get("/api/e2e/mcp-provider")).json(),
  );
  await mutate(page, "POST", "/api/mcp-servers", {
    name: "task_grant",
    specialistIds: [agent.id],
    config: {
      transport: "streamable-http",
      url: endpoint.url,
      authMethod: "headers",
      headers: [{ key: "Authorization", value: "Bearer test-access" }],
    },
  });
  await page.request.get(`/api/e2e/specialist-runtime/${agent.slug}`);
  const current = specialistSchema.parse(
    await (await page.request.get(`/api/specialists/${agent.id}`)).json(),
  );
  await mutate(page, "PATCH", `/api/specialists/${agent.id}`, {
    capabilities: {
      ...current.capabilities,
      mcpToolPermissions: [{ server: "task_grant", tool: "greet", action: "deny" }],
    },
  });
  await page.request.get(`/api/e2e/specialist-runtime/${agent.slug}`);
  const task = taskSchema.parse(
    await (
      await mutate(page, "POST", "/api/tasks", {
        agentId: agent.id,
        title: "Grant MCP",
        description: "CALL:task_grant_greet",
        permissionProfile: {
          mcpToolPermissions: [{ server: "task_grant", tool: "greet", action: "allow" }],
        },
      })
    ).json(),
  );
  const run = taskRunSchema.parse(
    await (await mutate(page, "POST", `/api/tasks/${task.id}/queue`, {})).json(),
  );
  await expect
    .poll(
      async () =>
        taskRunSchema.parse(
          await (await page.request.get(`/api/tasks/${task.id}/runs/${run.id}`)).json(),
        ).status,
      { timeout: 25000 },
    )
    .toBe("completed");
  const completed = taskRunSchema.parse(
    await (await page.request.get(`/api/tasks/${task.id}/runs/${run.id}`)).json(),
  );
  expect(completed.finalMessage).toContain("OAuth MCP greeting");
});
