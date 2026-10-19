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
