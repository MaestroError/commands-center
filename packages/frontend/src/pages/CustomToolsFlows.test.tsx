import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { queryClient } from "@/lib/query-client";

beforeEach(() => {
  queryClient.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  queryClient.clear();
});

describe("custom tools flow", () => {
  it("supports direct copy to a selected agent and rename on conflict", async () => {
    const requests = mockApi({
      "GET /api/agents": [
        jsonResponse(200, [
          {
            id: "agent-1",
            slug: "writer",
            name: "Writer",
            role: "write docs",
            instructions: "Write.",
            defaultModel: "openai/gpt-4.1",
            workspacePath: "/tmp/agents/writer",
            status: "active",
            capabilities: {
              builtInSkills: [],
              customTools: [],
              mcpServers: [],
              toolPermissions: [],
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ],
      "GET /api/custom-tools": [
        jsonResponse(200, [
          {
            id: "tool-1",
            slug: "release-helper",
            name: "Release Helper",
            description: "Draft release notes.",
            entryFile: "tool.ts",
            entryPath: "/tmp/tool.ts",
            directoryPath: "/tmp/release-helper",
            fingerprint: "fp-1",
            enabled: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            warnings: [],
            usage: [],
          },
        ]),
      ],
      "GET /api/agents/agent-1/custom-tools": [jsonResponse(200, [])],
      "POST /api/custom-tools/release-helper/copy-to-agents": [
        jsonResponse(409, {
          error: {
            message: "Custom tool 'release-helper' already exists in this agent workspace.",
          },
        }),
        jsonResponse(200, {
          copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
          warnings: [],
        }),
      ],
      "GET /api/opencode": [jsonResponse(200, { state: "healthy" })],
      "GET /api/tasks/runs/active": [jsonResponse(200, [])],
    });

    window.history.replaceState({}, "", "/tools");
    render(<App />);

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Global tools" });
    await screen.findByRole("option", { name: "Writer" });
    await user.selectOptions(screen.getByRole("combobox"), "agent-1");
    await user.click(screen.getByRole("button", { name: ">>" }));

    await screen.findByText("Tool name conflict");
    const renameInput = screen.getByDisplayValue("Release Helper");
    await user.clear(renameInput);
    await user.type(renameInput, "Release Helper Variant");
    await user.click(screen.getByRole("button", { name: "Copy with new name" }));

    await waitFor(() => {
      expect(requests).toContainEqual({
        key: "POST /api/custom-tools/release-helper/copy-to-agents",
        body: {
          agentIds: ["agent-1"],
          destinationName: "Release Helper Variant",
          overwrite: false,
        },
      });
    });
  });
});

function mockApi(routes: Record<string, Response[]>) {
  const requests: Array<{ key: string; body?: unknown }> = [];

  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : "";

    if (!rawUrl) {
      return Promise.reject(new Error("Unexpected request object."));
    }

    const url = new URL(rawUrl, "http://localhost");
    const method = init?.method ?? "GET";
    const key = `${method} ${url.pathname}${url.search}`;
    const fallbackKey = `${method} ${url.pathname}`;

    if (fallbackKey === "GET /api/auth/status") {
      return Promise.resolve(jsonResponse(200, { status: "claimed-authenticated" }));
    }

    const responses = routes[key] ?? routes[fallbackKey];
    requests.push({
      key: fallbackKey,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    });

    if (!responses || responses.length === 0) {
      return Promise.reject(new Error(`Unexpected fetch URL: ${key}`));
    }

    const next = responses.shift();

    if (!next) {
      throw new Error(`No mocked response left for ${key}.`);
    }

    return Promise.resolve(next);
  });

  return requests;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
