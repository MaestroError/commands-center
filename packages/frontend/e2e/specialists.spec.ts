import { expect, test, type Page, type Route } from "./fixtures";

type SpecialistRecord = {
  id: string;
  slug: string;
  name: string;
  role: string;
  instructions: string;
  defaultModel: string;
  iconPath?: string;
  workspacePath: string;
  status: "active" | "archived";
  capabilities: {
    builtInSkills: string[];
    mcpServers: Array<{ name: string; enabled: boolean; action: "allow" | "ask" | "deny" }>;
    toolPermissions: Array<{ pattern: string; action: "allow" | "ask" | "deny" }>;
  };
  createdAt: string;
  updatedAt: string;
};

test("lists, filters, and deletes specialists", async ({ page }) => {
  const state = createSpecialistState();
  await mockSpecialistApi(page, state);

  await page.goto("/specialists");
  await expect(page.getByRole("heading", { name: "Writer" })).toBeVisible();
  await page.getByPlaceholder("Search by name or role").fill("review");
  await expect(page.getByRole("heading", { name: "Reviewer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Writer" })).toHaveCount(0);
  await page.getByPlaceholder("Search by name or role").fill("");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("heading", { name: "Delete Writer?" })).toHaveCount(0);
});

test("creates and edits a specialist", async ({ page }) => {
  const state = createSpecialistState();
  await mockSpecialistApi(page, state);

  await page.goto("/specialists/new");
  await page.getByLabel(/^Name/).fill("Planner");
  await page.getByLabel(/^Role/).fill("plan work");
  await page.getByLabel(/^Instructions/).fill("Plan before editing.");
  await page.getByLabel(/^Model/).click();
  await page.getByRole("option", { name: "openai/gpt-4.1" }).click();
  await page.getByRole("button", { name: /^Emoji$/ }).click();
  await page.getByRole("textbox", { name: /^Emoji$/ }).fill("🤖");
  await page.getByLabel(/Search skills/i).fill("code");
  await page.getByRole("button", { name: /code-reviewer/i }).click();
  await page.getByRole("button", { name: "Create specialist" }).click();

  // Creating a specialist returns to the specialists list.
  await expect(page).toHaveURL(/\/specialists$/);
  await expect(page.getByRole("heading", { name: "Planner", level: 2 })).toBeVisible();

  // Open the newly created specialist for editing.
  await page.getByPlaceholder("Search by name or role").fill("Planner");
  await page.getByRole("link", { name: "Edit" }).click();

  await expect(page).toHaveURL(/\/specialists\/planner\/edit$/);
  await expect(page.getByLabel(/^Name/)).toHaveValue("Planner");
  await expect(page.getByLabel(/^Role/)).toHaveValue("plan work");
  await expect(page.getByRole("button", { name: /^Use 🤖 avatar$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/specialists/agent-") &&
      response.request().method() === "PATCH" &&
      response.status() === 200,
  );
  await page.getByLabel(/^Role/).fill("plan features");
  await expect(page.getByLabel(/^Role/)).toHaveValue("plan features");
  await page.getByRole("button", { name: "Save changes" }).click();
  await updateResponse;

  // Saving also returns to the specialists list, now showing the updated role.
  await expect(page).toHaveURL(/\/specialists$/);
  await expect(page.getByText("plan features")).toBeVisible();
});

test("browses built-in skills and detail metadata", async ({ page }) => {
  const state = createSpecialistState();
  await mockSpecialistApi(page, state);

  await page.goto("/skills");
  await expect(page.getByRole("button", { name: /code-reviewer/i })).toBeVisible();
  await page.getByPlaceholder("Search skills").fill("code");
  await expect(page.getByText("quality").first()).toBeVisible();
  if (page.viewportSize()?.width && page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Open context pane" }).click();
  }
  await page.getByRole("tab", { name: "Details" }).click();
  await expect(
    page
      .locator("li")
      .filter({ hasText: /^SKILL\.md$/ })
      .first(),
  ).toBeVisible();
});

async function mockSpecialistApi(
  page: Page,
  state: { agents: SpecialistRecord[]; catalog: unknown },
): Promise<void> {
  await page.route("**/api/opencode", async (route: Route) => {
    await route.fulfill(jsonResponse({ state: "healthy" }));
  });

  await page.route("**/api/tasks/runs/active", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/mcp-servers", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/custom-tools", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/specialists**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/specialists/catalog") {
      await route.fulfill(jsonResponse(state.catalog));
      return;
    }

    if (path === "/api/specialists" && route.request().method() === "GET") {
      await route.fulfill(jsonResponse(state.agents.filter((agent) => agent.status === "active")));
      return;
    }

    if (path === "/api/specialists" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Partial<SpecialistRecord> & {
        capabilities: SpecialistRecord["capabilities"];
      };
      const slug =
        payload.name
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ?? "specialist";
      const created: SpecialistRecord = {
        id: `agent-${state.agents.length + 1}`,
        slug,
        name: payload.name ?? "Specialist",
        role: payload.role ?? "role",
        instructions: payload.instructions ?? "instructions",
        defaultModel: payload.defaultModel ?? "openai/gpt-4.1",
        workspacePath: `/tmp/specialists/${slug}`,
        status: "active",
        capabilities: payload.capabilities,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        iconPath: payload.iconPath,
      };
      state.agents.push(created);
      await route.fulfill(jsonResponse(created, 201));
      return;
    }

    if (path.startsWith("/api/specialists/by-slug/")) {
      const slug = path.split("/").pop();
      const bySlugAgent = state.agents.find((entry) => entry.slug === slug);
      await route.fulfill(
        jsonResponse(bySlugAgent ?? { error: { message: "not found" } }, bySlugAgent ? 200 : 404),
      );
      return;
    }

    const id = path.split("/").pop() ?? "";
    const agent = state.agents.find((entry) => entry.id === id);

    if (!agent) {
      await route.fulfill(jsonResponse({ error: { message: "not found" } }, 404));
      return;
    }

    if (route.request().method() === "PATCH") {
      const payload = route.request().postDataJSON() as Partial<SpecialistRecord> & {
        capabilities?: SpecialistRecord["capabilities"];
      };
      const nextUpdatedAt = new Date(Date.parse(agent.updatedAt) + 1_000).toISOString();
      Object.assign(agent, payload, {
        slug: payload.name
          ? payload.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
          : agent.slug,
        workspacePath: payload.name
          ? `/tmp/specialists/${payload.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`
          : agent.workspacePath,
        updatedAt: nextUpdatedAt,
      });
      await route.fulfill(jsonResponse(agent));
      return;
    }

    if (route.request().method() === "DELETE") {
      agent.status = "archived";
      await route.fulfill(jsonResponse(agent));
      return;
    }

    await route.fulfill(jsonResponse(agent));
  });
}

function createSpecialistState() {
  return {
    agents: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write clear docs.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/specialists/writer",
        status: "active" as const,
        capabilities: {
          builtInSkills: ["code-reviewer"],
          mcpServers: [],
          toolPermissions: [],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "agent-2",
        slug: "reviewer",
        name: "Reviewer",
        role: "review code",
        instructions: "Review diffs.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/specialists/reviewer",
        status: "active" as const,
        capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    catalog: {
      builtInSkills: [
        {
          name: "code-reviewer",
          slug: "code-reviewer",
          description: "Review code changes for bugs and style issues.",
          category: "quality",
          version: "1.0.0",
          license: "Apache-2.0",
          compatibility: "opencode",
          metadata: { area: "quality", version: "1.0.0" },
          detailsMarkdown: "## What I do\n- Review code changes",
          files: ["SKILL.md"],
        },
      ],
      workspaceSkills: [],
      mcpServers: [{ name: "github", enabled: true }],
      appMcpServers: [],
      customTools: [
        {
          slug: "custom-write",
          name: "custom_write",
          description: "Draft helper.",
          enabled: true,
        },
      ],
      providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}
