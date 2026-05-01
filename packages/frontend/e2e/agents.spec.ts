import { expect, test, type Page, type Route } from "@playwright/test";

type AgentRecord = {
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

test("lists, filters, and deletes agents", async ({ page }) => {
  const state = createAgentState();
  await mockAgentApi(page, state);

  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Writer" })).toBeVisible();
  await page.getByPlaceholder("Search by name or role").fill("review");
  await expect(page.getByRole("heading", { name: "Reviewer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Writer" })).toHaveCount(0);
  await page.getByPlaceholder("Search by name or role").fill("");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("heading", { name: "Delete Writer?" })).toHaveCount(0);
});

test("creates and edits an agent", async ({ page }) => {
  const state = createAgentState();
  await mockAgentApi(page, state);

  await page.goto("/agents/new");
  await page.getByLabel(/Name/).fill("Planner");
  await page.getByLabel(/Role/).fill("plan work");
  await page.getByLabel(/Instructions/).fill("Plan before editing.");
  await page.getByLabel(/Model/).selectOption("openai/gpt-4.1");
  await page.getByRole("button", { name: "Emoji" }).click();
  await page.getByLabel(/Emoji/).fill("🤖");
  await page.getByText("screen-requirements-writing").click();
  await page.getByRole("button", { name: "Create agent" }).click();

  await expect(page).toHaveURL(/\/agents\/planner\/edit$/);
  await expect(page.getByLabel(/Name/)).toHaveValue("Planner");
  await expect(page.getByText("🤖")).toBeVisible();
  await page.getByLabel(/Role/).fill("plan features");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel(/Role/)).toHaveValue("plan features");
});

test("browses built-in skills and detail metadata", async ({ page }) => {
  const state = createAgentState();
  await mockAgentApi(page, state);

  await page.goto("/skills");
  await expect(
    page.getByRole("button").filter({ hasText: "screen-requirements-writing" }).first(),
  ).toBeVisible();
  await page.getByPlaceholder("Search skills").fill("screen");
  await expect(page.getByRole("button").filter({ hasText: "design-docs" }).first()).toBeVisible();
  if (page.viewportSize()?.width && page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Open context pane" }).click();
  }
  await expect(page.getByText("SKILL.md")).toBeVisible();
});

async function mockAgentApi(
  page: Page,
  state: { agents: AgentRecord[]; catalog: unknown },
): Promise<void> {
  await page.route("**/api/agents**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/api/agents/catalog") {
      await route.fulfill(jsonResponse(state.catalog));
      return;
    }

    if (path === "/api/agents" && route.request().method() === "GET") {
      await route.fulfill(jsonResponse(state.agents.filter((agent) => agent.status === "active")));
      return;
    }

    if (path === "/api/agents" && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Partial<AgentRecord> & {
        capabilities: AgentRecord["capabilities"];
      };
      const slug =
        payload.name
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") ?? "agent";
      const created: AgentRecord = {
        id: `agent-${state.agents.length + 1}`,
        slug,
        name: payload.name ?? "Agent",
        role: payload.role ?? "role",
        instructions: payload.instructions ?? "instructions",
        defaultModel: payload.defaultModel ?? "openai/gpt-4.1",
        workspacePath: `/tmp/agents/${slug}`,
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

    if (path.startsWith("/api/agents/by-slug/")) {
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
      const payload = route.request().postDataJSON() as Partial<AgentRecord> & {
        capabilities?: AgentRecord["capabilities"];
      };
      Object.assign(agent, payload, {
        slug: payload.name
          ? payload.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")
          : agent.slug,
        workspacePath: payload.name
          ? `/tmp/agents/${payload.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`
          : agent.workspacePath,
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

function createAgentState() {
  return {
    agents: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write clear docs.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/agents/writer",
        status: "active" as const,
        capabilities: {
          builtInSkills: ["screen-requirements-writing"],
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
        workspacePath: "/tmp/agents/reviewer",
        status: "active" as const,
        capabilities: { builtInSkills: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    catalog: {
      builtInSkills: [
        {
          name: "screen-requirements-writing",
          slug: "screen-requirements-writing",
          description: "Create screen requirement documents.",
          category: "design-docs",
          version: "1.0.0",
          license: "MIT",
          compatibility: "opencode",
          metadata: { area: "design-docs", version: "1.0.0" },
          detailsMarkdown: "## What I do\n- Create screen docs",
          files: ["SKILL.md"],
        },
      ],
      mcpServers: [{ name: "github", enabled: true }],
      customTools: [{ name: "custom_write", enabled: true }],
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
