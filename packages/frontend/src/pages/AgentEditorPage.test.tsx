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
      workspaceSkills: [],
      mcpServers: [{ name: "github", enabled: true }],
      appMcpServers: [
        {
          name: "cc_app",
          enabledByDefault: false,
          description: "CommandsCenter app-managed capabilities for this agent.",
          tools: [{ name: "add_secret", description: "Add a workspace secret." }],
        },
        {
          name: "cc_tool_management",
          enabledByDefault: false,
          description:
            "CommandsCenter-managed tool creation and library maintenance for this agent.",
          tools: [
            { name: "create_custom_tool", description: "Create a custom tool." },
            { name: "copy_custom_tool_to_agent", description: "Copy a custom tool." },
          ],
        },
      ],
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
        capabilities: {
          builtInSkills: [],
          workspaceSkills: [],
          customTools: [],
          mcpServers: [],
          toolPermissions: [],
          appMcpServers: [],
          appToolPermissions: [],
        },
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
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
        appMcpServers: [],
        appToolPermissions: [],
      },
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
    data: [
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
    ],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useAgentCustomToolsQuery).mockReturnValue({
    data: [
      {
        slug: "release-helper",
        name: "Release Helper",
        description: "Draft release notes.",
        entryFile: "release-helper.ts",
        entryPath: "/tmp/release-helper.ts",
        fingerprint: "fp-2",
        status: "modified",
        isManaged: true,
        sourceToolSlug: "legacy-release-helper",
        sourceFingerprint: "fp-1",
        copiedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    ],
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
            workspaceSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "allow" }],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
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
            workspaceSkills: [],
            customTools: [],
            mcpServers: [{ name: "github", enabled: true, action: "ask" }],
            toolPermissions: [],
            appMcpServers: [],
            appToolPermissions: [],
          },
        },
      });
    });
  });

  it("saves CC-managed MCP group permission when selected", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "cc_app Allow" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          capabilities: expect.objectContaining({
            appMcpServers: [
              {
                name: "cc_app",
                enabled: true,
                action: "allow",
                perToolPermissionsEnabled: false,
              },
            ],
            appToolPermissions: [],
          }),
        }),
      });
    });
  });

  it("saves tool management MCP group permission when selected", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "cc_tool_management Allow" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          capabilities: expect.objectContaining({
            appMcpServers: [
              {
                name: "cc_tool_management",
                enabled: true,
                action: "allow",
                perToolPermissionsEnabled: false,
              },
            ],
            appToolPermissions: [],
          }),
        }),
      });
    });
  });

  it("saves per-tool CC-managed MCP permissions when enabled", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "cc_tool_management Allow" }));
    fireEvent.click(screen.getByLabelText(/Configure tools individually/i));
    fireEvent.click(
      screen.getByRole("button", { name: "cc_tool_management copy_custom_tool_to_agent Ask" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          capabilities: expect.objectContaining({
            appMcpServers: [
              {
                name: "cc_tool_management",
                enabled: true,
                action: "allow",
                perToolPermissionsEnabled: true,
              },
            ],
            appToolPermissions: [
              { pattern: "cc_tool_management_copy_custom_tool_to_agent", action: "ask" },
            ],
          }),
        }),
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

  it("saves emoji avatars through the picker", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    fireEvent.change(screen.getByPlaceholderText("🤖"), { target: { value: "🧠" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          iconPath: "emoji:🧠",
        }),
      });
    });
  });

  it("saves icon avatars through the picker", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Icon" }));
    fireEvent.click(screen.getByRole("button", { name: "Builder" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          iconPath: "icon:hammer",
        }),
      });
    });
  });

  it("saves selected custom tools and collects overwrite slugs for existing local copies", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderEditor();

    fireEvent.change(screen.getByRole("textbox", { name: "Search global tools" }), {
      target: { value: "release" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Release Helper/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: "agent-1",
        input: expect.objectContaining({
          customToolOverwriteSlugs: ["release-helper"],
          capabilities: expect.objectContaining({
            customTools: ["release-helper"],
          }),
        }),
      });
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
