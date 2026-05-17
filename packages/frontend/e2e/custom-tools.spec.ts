import { expect, test, type Page, type Route } from "./fixtures";

type CustomToolRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  entryFile: string;
  entryPath: string;
  directoryPath: string;
  fingerprint: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  warnings: Array<{ code: string; message: string }>;
  usage: Array<{
    agentId: string;
    agentSlug: string;
    agentName: string;
    status: string;
    entryFile: string;
  }>;
};

type AgentToolRecord = {
  slug: string;
  name: string;
  description: string;
  entryFile: string;
  entryPath: string;
  fingerprint: string;
  status: string;
  isManaged: boolean;
  sourceToolSlug?: string;
  sourceFingerprint?: string;
  copiedAt?: string;
  warnings: Array<{ code: string; message: string }>;
};

test("creates a tool, resolves copy conflict with rename, and removes agent-local copy", async ({
  page,
}) => {
  const state = createState();
  await mockCustomToolsApi(page, state);

  await page.goto("/tools");
  await page.getByPlaceholder("Tool name").fill("Release Helper");
  await page.getByPlaceholder("Description").fill("Draft release notes.");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/files\?/);
  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Release Helper" })).toBeVisible();
  await page.getByRole("combobox").selectOption("agent-1");
  await page.getByRole("button", { name: ">>" }).click();

  await expect(page.getByText("Tool name conflict")).toBeVisible();
  await page
    .locator("section")
    .filter({ hasText: "Tool name conflict" })
    .locator("input")
    .fill("Release Helper Variant");
  await page.getByRole("button", { name: "Copy with new name" }).click();

  await expect(page.getByText("Tool name conflict")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Release Helper Variant" })).toBeVisible();
  await page
    .locator("article")
    .filter({ hasText: "Release Helper Variant" })
    .getByRole("button", { name: /^Remove$/ })
    .click();
  await page
    .getByRole("button", { name: /^Remove$/ })
    .last()
    .click();
  await expect(page.locator("article").filter({ hasText: "Release Helper Variant" })).toHaveCount(
    0,
  );
});

async function mockCustomToolsApi(
  page: Page,
  state: {
    agents: Array<{ id: string; slug: string; name: string }>;
    tools: CustomToolRecord[];
    agentTools: Record<string, AgentToolRecord[]>;
  },
): Promise<void> {
  await page.route("**/api/opencode", async (route: Route) => {
    await route.fulfill(jsonResponse({ state: "healthy" }));
  });

  await page.route("**/api/tasks/runs/active", async (route: Route) => {
    await route.fulfill(jsonResponse([]));
  });

  await page.route("**/api/agents/catalog", async (route: Route) => {
    await route.fulfill(
      jsonResponse({
        builtInSkills: [],
        workspaceSkills: [],
        providerModels: [],
        mcpServers: [],
        appMcpServers: [],
        customTools: [],
      }),
    );
  });

  await page.route("**/api/agents", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }

    await route.fulfill(
      jsonResponse(
        state.agents.map((agent) => ({
          ...agent,
          role: "role",
          instructions: "instructions",
          defaultModel: "openai/gpt-4.1",
          workspacePath: `/tmp/agents/${agent.slug}`,
          status: "active",
          capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })),
      ),
    );
  });

  await page.route("**/api/custom-tools", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill(jsonResponse(state.tools));
      return;
    }

    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { name: string; description: string };
      const slug = slugify(payload.name);
      const tool: CustomToolRecord = {
        id: `tool-${state.tools.length + 1}`,
        slug,
        name: payload.name,
        description: payload.description,
        entryFile: "tool.ts",
        entryPath: `/tmp/${slug}/tool.ts`,
        directoryPath: `/tmp/${slug}`,
        fingerprint: `fp-${state.tools.length + 1}`,
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      };
      state.tools.unshift(tool);
      await route.fulfill(jsonResponse({ tool, overwritten: false, warnings: [] }, 201));
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/custom-tools/*/copy-to-agents", async (route: Route) => {
    const slug = route.request().url().split("/").at(-2) ?? "";
    const payload = route.request().postDataJSON() as {
      agentIds: string[];
      destinationName?: string;
      overwrite: boolean;
    };
    const agentId = payload.agentIds[0] ?? "";
    const nextSlug = slugify(
      payload.destinationName ?? state.tools.find((tool) => tool.slug === slug)?.name ?? slug,
    );
    const existing = state.agentTools[agentId] ?? [];

    if (!payload.overwrite && existing.some((tool) => tool.slug === nextSlug)) {
      await route.fulfill(
        jsonResponse(
          {
            error: { message: `Custom tool '${nextSlug}' already exists in this agent workspace.` },
          },
          409,
        ),
      );
      return;
    }

    state.agentTools[agentId] = [
      ...existing.filter((tool) => tool.slug !== nextSlug),
      {
        slug: nextSlug,
        name:
          payload.destinationName ?? state.tools.find((tool) => tool.slug === slug)?.name ?? slug,
        description: "Draft release notes.",
        entryFile: `${nextSlug}.ts`,
        entryPath: `/tmp/${nextSlug}.ts`,
        fingerprint: "fp-agent",
        status: "matching",
        isManaged: true,
        sourceToolSlug: slug,
        sourceFingerprint: "fp-1",
        copiedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    ];
    await route.fulfill(
      jsonResponse({
        copied: [{ agentId, agentSlug: "writer", overwritten: payload.overwrite }],
        warnings: [],
      }),
    );
  });

  await page.route("**/api/agents/*/custom-tools**", async (route: Route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const agentId = parts[3] ?? "";

    if (route.request().method() === "GET") {
      await route.fulfill(jsonResponse(state.agentTools[agentId] ?? []));
      return;
    }

    if (route.request().method() === "DELETE") {
      const slug = parts.at(-1) ?? "";
      state.agentTools[agentId] = (state.agentTools[agentId] ?? []).filter(
        (tool) => tool.slug !== slug,
      );
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fallback();
  });
}

function createState() {
  return {
    agents: [{ id: "agent-1", slug: "writer", name: "Writer" }],
    tools: [] as CustomToolRecord[],
    agentTools: {
      "agent-1": [
        {
          slug: "release-helper",
          name: "Release Helper",
          description: "Draft release notes.",
          entryFile: "release-helper.ts",
          entryPath: "/tmp/release-helper.ts",
          fingerprint: "fp-existing",
          status: "matching",
          isManaged: true,
          sourceToolSlug: "release-helper",
          sourceFingerprint: "fp-existing",
          copiedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
        },
      ],
    } as Record<string, AgentToolRecord[]>,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}
