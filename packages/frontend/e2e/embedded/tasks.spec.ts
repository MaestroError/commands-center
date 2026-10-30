import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import {
  specialistSchema,
  taskTemplateSchema,
  taskSchema,
  taskRunSchema,
  taskRunListSchema,
  type TaskRun,
} from "@cc/shared/schemas";

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/login");
  await page.getByTestId("owner-login-password").fill("Local-v2-test-password!");
  await page.getByTestId("owner-login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
  cookies = await page.context().cookies();
  await page.close();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});
test.afterEach(async ({ page }) => {
  await post(page, "/api/e2e/provider/release");
  await post(page, "/api/e2e/task-monitor/resume");
});

async function post(page: Page, url: string, data: unknown = {}): Promise<unknown> {
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "cc_csrf_token");
  const response = await page.request.post(url, {
    headers: { "x-csrf-token": csrf?.value ?? "", origin: "http://127.0.0.1:4176" },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function createTask(page: Page, title: string, extra: Record<string, unknown> = {}) {
  const agent = specialistSchema.parse(
    await post(page, "/api/specialists", {
      name: title,
      role: "Task tester",
      instructions: "Execute the requested task.",
      defaultModel: "local-e2e/test",
      capabilities: {},
    }),
  );
  return taskSchema.parse(
    await post(page, "/api/tasks", {
      agentId: agent.id,
      title,
      status: "backlog",
      ...extra,
    }),
  );
}
async function runState(page: Page, run: TaskRun): Promise<TaskRun> {
  return taskRunSchema.parse(
    await (await page.request.get(`/api/tasks/${run.taskId}/runs/${run.id}`)).json(),
  );
}
async function queue(page: Page, taskId: string): Promise<TaskRun> {
  return taskRunSchema.parse(await post(page, `/api/tasks/${taskId}/queue`));
}
async function completed(page: Page, run: TaskRun): Promise<TaskRun> {
  await expect
    .poll(async () => (await runState(page, run)).status, { timeout: 40000 })
    .toBe("completed");
  return runState(page, run);
}

test("completes a manually queued task through the embedded SDK", async ({ page }) => {
  const task = await createTask(page, "Manual native task");
  const result = await completed(page, await queue(page, task.id));
  expect(result.finalMessage).toContain("Local v2 response.");
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole("heading", { name: "Edit task title", exact: true })).toHaveText(
    task.title,
  );
});

test("dispatches a due scheduled task through the embedded SDK", async ({ page }) => {
  test.setTimeout(60000);
  const task = await createTask(page, "Scheduled native task", {
    status: "scheduled",
    scheduledAt: new Date(Date.now() + 1500).toISOString(),
  });
  let runs: TaskRun[] = [];
  await expect
    .poll(
      async () => {
        runs = taskRunListSchema.parse(
          await (await page.request.get(`/api/tasks/${task.id}/runs`)).json(),
        );
        return runs[0]?.status;
      },
      { timeout: 40000 },
    )
    .toBe("completed");
  expect(runs[0]?.triggerSource).toBe("scheduled");
});

test("executes task-dependent managed tools in an unattended run", async ({ page }) => {
  const task = await createTask(page, "Managed native task", {
    description: "CALL:cc_default_list_self_tasks",
  });
  const result = await completed(page, await queue(page, task.id));
  expect(result.finalMessage).toContain(task.title);
});

test("denies a tool forbidden by task permissions", async ({ page }) => {
  const task = await createTask(page, "Denied native task", {
    description: "CALL:cc_default_get_self_profile",
    permissionProfile: {
      appToolPermissions: [{ pattern: "cc_default_get_self_profile", action: "deny" }],
    },
  });
  const result = await completed(page, await queue(page, task.id));
  expect(result.finalMessage).toMatch(/No tool named/);
});

test("cancels a running embedded task", async ({ page }) => {
  await post(page, "/api/e2e/provider/hold");
  const task = await createTask(page, "Cancelled native task", {
    description: "CANCEL_RUNNING_MARKER",
  });
  const run = await queue(page, task.id);
  await expect
    .poll(async () =>
      (await (await page.request.get("/api/e2e/provider-requests")).text()).includes(
        "CANCEL_RUNNING_MARKER",
      ),
    )
    .toBe(true);
  const cancelled = taskRunSchema.parse(
    await post(page, `/api/tasks/${task.id}/runs/${run.id}/cancel`),
  );
  expect(cancelled.status).toBe("cancelled");
});

test("recovers monitoring without duplicating an accepted prompt", async ({ page }) => {
  await post(page, "/api/e2e/provider/hold");
  const task = await createTask(page, "Recovered native task", {
    description: "RECOVERY_UNIQUE_MARKER",
  });
  const run = await queue(page, task.id);
  const countRequests = async (): Promise<number> => {
    const requests: unknown = await (await page.request.get("/api/e2e/provider-requests")).json();
    if (!Array.isArray(requests)) throw new Error("Missing provider requests");
    return requests.filter(
      (item: unknown) => typeof item === "string" && item.includes("RECOVERY_UNIQUE_MARKER"),
    ).length;
  };
  await expect.poll(countRequests).toBe(1);
  await post(page, "/api/e2e/task-monitor/pause");
  await post(page, "/api/e2e/provider/release");
  await post(page, "/api/e2e/task-monitor/resume");
  await completed(page, run);
  expect(await countRequests()).toBe(1);
});

test("sends a task model tier through the scheduler", async ({ page }) => {
  const task = await createTask(page, "TASK_TIER_PROBE", { model: "local-e2e/test#high" });
  await completed(page, await queue(page, task.id));
  const requests = (await (
    await page.request.get("/api/e2e/provider-requests")
  ).json()) as string[];
  expect(
    requests.some(
      (request) =>
        request.includes("TASK_TIER_PROBE") && request.includes('"reasoning_effort":"high"'),
    ),
  ).toBe(true);
});

test("saves a tier from the task editor", async ({ page }) => {
  const task = await createTask(page, "Tier editor task");
  await page.goto(`/tasks/${task.id}/edit`);
  await page.getByRole("button", { name: "Select model", exact: true }).first().click();
  await page.getByRole("option", { name: /local-e2e/ }).click();
  await page.getByTestId("model-tier").click();
  await page.getByRole("option", { name: "high", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tasks/${task.id}`) && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  expect(await (await saved).json()).toMatchObject({ model: "local-e2e/test#high" });
});

test("saves a tier from the task template editor", async ({ page }) => {
  await createTask(page, "Tier template specialist");
  await page.goto("/tasks/templates/new");
  await page.getByTestId("task-template-title-input").fill("Tier template UI");
  await page.getByRole("combobox", { name: "Default specialist" }).fill("Tier template specialist");
  await page.getByRole("option", { name: "Tier template specialist", exact: true }).click();
  await page.getByRole("button", { name: "Select model", exact: true }).first().click();
  await page.getByRole("option", { name: /local-e2e/ }).click();
  await page.getByTestId("model-tier").click();
  await page.getByRole("option", { name: "high", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tasks/templates") && response.request().method() === "POST",
  );
  await page.getByTestId("task-template-save").click();
  expect(await (await saved).json()).toMatchObject({ model: "local-e2e/test#high" });
});

test("edits a template prompt as a file before generating a task", async ({ page, context }) => {
  const task = await createTask(page, "File template specialist");
  const template = taskTemplateSchema.parse(
    await post(page, "/api/tasks/templates", {
      defaultAgentId: task.agentId,
      title: "File-backed template",
      description: "Original prompt",
    }),
  );
  await page.goto(`/tasks/templates/${template.id}/edit`);
  const opened = context.waitForEvent("page");
  await page.getByTestId("task-template-edit-file").click();
  const files = await opened;
  await expect(files).toHaveURL(/\/files\?.*tabs=/);
  const editor = files.getByRole("textbox", { name: /Editor content/ });
  await editor.focus();
  await editor.press("Home");
  await editor.press("Shift+End");
  await editor.press("Backspace");
  await files.keyboard.insertText("Edited in Monaco: use the latest file content.");
  await files.getByRole("button", { name: "Save", exact: true }).click();
  await expect(files.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const generated = taskSchema.parse(await post(page, `/api/tasks/templates/${template.id}/tasks`));
  expect(generated.description).toBe("Edited in Monaco: use the latest file content.");
  await files.close();
});

test("creates a task with a grant from a disabled CC group", async ({ page }) => {
  await createTask(page, "Override creation specialist");
  await page.goto("/tasks/new");
  await page.getByLabel("Title", { exact: true }).fill("Task override UI");
  await page
    .getByRole("combobox", { name: "Assigned specialist" })
    .fill("Override creation specialist");
  await page.getByRole("option", { name: "Override creation specialist", exact: true }).click();
  await page.getByRole("switch", { name: "Change available tools" }).click();
  await expect(
    page.getByRole("button", { name: "cc_tasks_management list_tasks Allow", exact: true }),
  ).toBeHidden();
  await page.getByText("cc_tasks_management tools", { exact: true }).click();
  await page
    .getByRole("button", { name: "cc_tasks_management list_tasks Allow", exact: true })
    .click();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith("/api/tasks") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const task = taskSchema.parse(await (await saved).json());
  expect(task.permissionProfile?.appToolPermissions).toContainEqual({
    pattern: "cc_tasks_management_list_tasks",
    action: "allow",
  });
});

test("restores specialist inheritance from the task editor", async ({ page }) => {
  const task = await createTask(page, "Restore task defaults", {
    permissionProfile: {
      appToolPermissions: [],
      toolPermissions: [{ pattern: "retained_custom", action: "deny" }],
    },
  });
  await page.goto(`/tasks/${task.id}/edit`);
  await expect(page.getByRole("switch", { name: "Change available tools" })).toBeChecked();
  await page.getByRole("switch", { name: "Change available tools" }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tasks/${task.id}`) && response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  expect(taskSchema.parse(await (await saved).json()).permissionProfile).toEqual({
    toolPermissions: [{ pattern: "retained_custom", action: "deny" }],
  });
  await page.goto(`/tasks/${task.id}/edit`);
  await expect(page.getByRole("switch", { name: "Change available tools" })).not.toBeChecked();
});

test("creates a template with CC tool overrides", async ({ page }) => {
  await createTask(page, "Override template specialist");
  await page.goto("/tasks/templates/new");
  await page.getByTestId("task-template-title-input").fill("Override template UI");
  await page
    .getByRole("combobox", { name: "Default specialist" })
    .fill("Override template specialist");
  await page.getByRole("option", { name: "Override template specialist", exact: true }).click();
  await page.getByRole("switch", { name: "Change available tools" }).click();
  await page.getByText("cc_default tools", { exact: true }).click();
  await page.getByRole("button", { name: "cc_default set_task_result Deny", exact: true }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tasks/templates") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create template", exact: true }).click();
  const template = taskTemplateSchema.parse(await (await saved).json());
  expect(template.permissionProfile?.appToolPermissions).toContainEqual({
    pattern: "cc_default_set_task_result",
    action: "deny",
  });
  await page.goto(`/tasks/templates/${template.id}/edit`);
  await page.getByText("cc_default tools", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "cc_default set_task_result Deny", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("restores specialist inheritance from the template editor", async ({ page }) => {
  const task = await createTask(page, "Restore template specialist");
  const template = taskTemplateSchema.parse(
    await post(page, "/api/tasks/templates", {
      defaultAgentId: task.agentId,
      title: "Restore template",
      permissionProfile: {
        appToolPermissions: [],
        toolPermissions: [{ pattern: "retained_custom", action: "deny" }],
      },
    }),
  );
  await page.goto(`/tasks/templates/${template.id}/edit`);
  await page.getByRole("switch", { name: "Change available tools" }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/tasks/templates/${template.id}`) &&
      response.request().method() === "PATCH",
  );
  await page.getByRole("button", { name: "Save template", exact: true }).click();
  expect(taskTemplateSchema.parse(await (await saved).json()).permissionProfile).toEqual({
    toolPermissions: [{ pattern: "retained_custom", action: "deny" }],
  });
});

test("executes a task override from a specialist-disabled CC group", async ({ page }) => {
  const task = await createTask(page, "Override execution specialist", {
    description: "CALL:cc_tasks_management_list_tasks",
    permissionProfile: {
      appToolPermissions: [{ pattern: "cc_tasks_management_list_tasks", action: "allow" }],
    },
  });
  const result = await completed(page, await queue(page, task.id));
  expect(result.finalMessage).toMatch(/Found \d+ tasks\./);
});

for (const template of [false, true]) {
  test(`creates and edits ${template ? "template" : "task"} MCP tool overrides`, async ({
    page,
  }) => {
    const title = template ? "Template MCP matrix" : "Task MCP matrix";
    const task = await createTask(page, title);
    const agent = specialistSchema.parse(
      await (await page.request.get(`/api/specialists/${task.agentId}`)).json(),
    );
    const endpoint = (await (await page.request.get("/api/e2e/mcp-provider")).json()) as {
      url: string;
    };
    const name = template ? "template_permissions" : "task_permissions";
    await post(page, "/api/mcp-servers", {
      name,
      specialistIds: [agent.id],
      config: {
        transport: "streamable-http",
        url: endpoint.url,
        authMethod: "headers",
        headers: [{ key: "Authorization", value: "Bearer test-access" }],
      },
    });
    await page.request.get(`/api/e2e/specialist-runtime/${agent.slug}`);
    await page.goto(template ? "/tasks/templates/new" : "/tasks/new");
    if (template) await page.getByTestId("task-template-title-input").fill(title);
    else await page.getByLabel("Title", { exact: true }).fill(title);
    await page
      .getByRole("combobox", { name: template ? "Default specialist" : "Assigned specialist" })
      .fill(agent.name);
    await page.getByRole("option", { name: agent.name, exact: true }).click();
    await page.getByRole("switch", { name: "Change available tools" }).click();
    await expect(
      page.getByRole("button", { name: `${name} greet Deny`, exact: true }),
    ).toBeHidden();
    await page.getByText(`${name} tools`, { exact: true }).click();
    await page.getByRole("button", { name: `${name} greet Deny`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${name} greet Ask`, exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: template ? "Create template" : "Create task", exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/new$/);
    const list = (await (
      await page.request.get(template ? "/api/tasks/templates" : "/api/tasks")
    ).json()) as {
      id: string;
      title: string;
      permissionProfile?: {
        mcpToolPermissions?: { server: string; tool: string; action: string }[];
      };
    }[];
    const saved = list.find(
      (entry) => entry.title === title && entry.permissionProfile?.mcpToolPermissions?.length,
    );
    expect(saved?.permissionProfile?.mcpToolPermissions).toContainEqual({
      server: name,
      tool: "greet",
      action: "deny",
    });
    await page.goto(template ? `/tasks/templates/${saved!.id}/edit` : `/tasks/${saved!.id}/edit`);
    await page.getByText(`${name} tools`, { exact: true }).click();
    await expect(
      page.getByRole("button", { name: `${name} greet Deny`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: `${name} greet Allow`, exact: true }).click();
    await page
      .getByRole("button", { name: template ? "Save template" : "Save task", exact: true })
      .click();
    await expect(page).not.toHaveURL(/\/edit$/);
    const updated = (await (
      await page.request.get(
        template ? `/api/tasks/templates/${saved!.id}` : `/api/tasks/${saved!.id}`,
      )
    ).json()) as { permissionProfile: { mcpToolPermissions: unknown[] } };
    expect(updated.permissionProfile.mcpToolPermissions).toContainEqual({
      server: name,
      tool: "greet",
      action: "allow",
    });
  });
}

test("queues a reply from task chat while the specialist is busy", async ({ page }) => {
  const task = await createTask(page, "Queued chat reply");
  const first = await completed(page, await queue(page, task.id));
  await post(page, "/api/e2e/provider/hold");
  const secondTask = taskSchema.parse(
    await post(page, "/api/tasks", { agentId: task.agentId, title: "Busy elsewhere" }),
  );
  const second = await queue(page, secondTask.id);
  await expect.poll(async () => (await runState(page, second)).status).toBe("running");
  const opened = (await post(page, `/api/tasks/${task.id}/runs/${first.id}/open-in-chat`)) as {
    current: { id: string };
  };
  const agent = specialistSchema.parse(
    await (await page.request.get(`/api/specialists/${task.agentId}`)).json(),
  );
  await page.goto(`/chat/${agent.slug}/${opened.current.id}`);
  await page.getByTestId("chat-message-input").fill("QUEUED_BROWSER_REPLY");
  await page.getByRole("button", { name: "Queue reply", exact: true }).click();
  await expect(page.getByTestId("task-run-reply-queue")).toContainText("QUEUED_BROWSER_REPLY");
  await page.reload();
  await expect(page.getByTestId("task-run-reply-queue")).toContainText("QUEUED_BROWSER_REPLY");
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-run-reply-queue").first()).toContainText(
    "QUEUED_BROWSER_REPLY",
  );
  await post(page, "/api/e2e/provider/release");
  await completed(page, second);
  await expect
    .poll(
      async () => {
        const replies = (await (
          await page.request.get(`/api/tasks/${task.id}/runs/${first.id}/followups`)
        ).json()) as { status: string }[];
        return replies[0]?.status;
      },
      { timeout: 40000 },
    )
    .toBe("answered");
  expect((await runState(page, first)).opencodeSessionId).toBe(first.opencodeSessionId);
});

test("delegates through native tools and resumes the owner to accept the result", async ({
  page,
}) => {
  test.setTimeout(90000);
  const worker = specialistSchema.parse(
    await post(page, "/api/specialists", {
      name: "Team browser worker",
      role: "Prepare a bounded report",
      instructions: "Produce the requested report.",
      defaultModel: "local-e2e/test",
      capabilities: {},
    }),
  );
  const owner = specialistSchema.parse(
    await post(page, "/api/specialists", {
      name: "Team browser owner",
      role: "Coordinate the goal",
      instructions: "Delegate and review the worker result.",
      defaultModel: "local-e2e/test",
      capabilities: { allowedTeammates: [worker.slug] },
    }),
  );
  await page.goto(`/specialists/${owner.slug}/edit`);
  await expect(page.getByRole("checkbox", { name: new RegExp(worker.name) })).toBeChecked();
  const args = Buffer.from(
    JSON.stringify({
      specialistSlug: worker.slug,
      brief: "Write a short report",
      expectedOutput: "A report",
    }),
  ).toString("base64");
  const task = taskSchema.parse(
    await post(page, "/api/tasks", {
      agentId: owner.id,
      title: "Complete team goal",
      description: `CALL:cc_default_delegate_assignment ARGS:${args}`,
    }),
  );
  const root = await queue(page, task.id);
  await completed(page, root);
  const assignments = (await (await page.request.get(`/api/tasks/${task.id}/subtasks`)).json()) as {
    ownerRunId: string;
    acceptedAt?: string;
  }[];
  expect(assignments).toHaveLength(1);
  expect(assignments[0]?.ownerRunId).toBe(root.id);
  expect(assignments[0]?.acceptedAt).toBeTruthy();
  const runs = taskRunListSchema.parse(
    await (await page.request.get(`/api/tasks/${task.id}/runs`)).json(),
  );
  expect(runs.find((run) => run.agentId === worker.id)?.status).toBe("completed");
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByRole("region", { name: "Task collaboration" })).toContainText(
    "Accepted by owner",
  );
  await expect(page.getByRole("region", { name: "Task collaboration" })).toContainText(worker.name);
});
