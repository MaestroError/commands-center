import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentEditorPage } from "./AgentEditorPage";

import {
  useAgentCatalogQuery,
  useAgentMutations,
  useAgentQuery,
  useAgentsQuery,
} from "@/hooks/use-agents-query";
import { useAgentCustomToolsQuery, useCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentCatalogQuery: vi.fn(),
  useAgentMutations: vi.fn(),
  useAgentQuery: vi.fn(),
  useAgentsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
}));

vi.mock("@/hooks/use-custom-tools-query", () => ({
  useCustomToolsQuery: vi.fn(),
  useAgentCustomToolsQuery: vi.fn(),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();

  vi.mocked(useAgentCatalogQuery).mockReturnValue({
    data: {
      builtInSkills: [],
      mcpServers: [{ name: "github", enabled: true }],
      customTools: [],
      providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
    },
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentsQuery).mockReturnValue({
    data: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write useful docs.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/agents/writer",
        status: "active",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentQuery).mockReturnValue({
    data: {
      id: "agent-1",
      slug: "writer",
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs.",
      defaultModel: "openai/gpt-4.1",
      workspacePath: "/tmp/agents/writer",
      status: "active",
      capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useMcpServersQuery).mockReturnValue({
    data: [
      {
        id: "mcp-1",
        name: "github",
        enabled: true,
        config: {
          url: "https://example.com/mcp",
          transport: "streamable-http",
          authMethod: "oauth",
          headers: [],
        },
        runtimeStatus: { status: "connected" },
        tools: [{ id: "github_create_issue", name: "create_issue" }],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useCustomToolsQuery).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentCustomToolsQuery).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentMutations).mockReturnValue({
    create: { mutateAsync: createMutateAsync, isPending: false },
    update: { mutateAsync: updateMutateAsync, isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
  } as never);
});

describe("AgentEditorPage", () => {
  it("saves MCP server permission as allow when selected", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "github Allow" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          iconPath: undefined,
          customToolOverwriteSlugs: [],
          capabilities: {
            builtInSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "allow" }],
            toolPermissions: [],
          },
        },
      });
    });
  });

  it("saves MCP server permission as ask when selected", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "github Ask" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: {
          name: "Writer",
          role: "write docs",
          instructions: "Write useful docs.",
          defaultModel: "openai/gpt-4.1",
          iconPath: undefined,
          customToolOverwriteSlugs: [],
          capabilities: {
            builtInSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [],
          },
        },
      });
    });
  });

  it("shows save errors from failed agent updates", async () => {
    updateMutateAsync.mockRejectedValue(new Error("Save failed"));

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });
});

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/agents/writer/edit"]}>
      <Routes>
        <Route path="/agents/:slug/edit" element={<AgentEditorPage mode="edit" />} />
      </Routes>
    </MemoryRouter>,
  );
}
