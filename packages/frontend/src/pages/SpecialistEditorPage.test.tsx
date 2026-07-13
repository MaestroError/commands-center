import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpecialistEditorPage } from "./SpecialistEditorPage";

import {
  useSpecialistCatalogQuery,
  useSpecialistMutations,
  useSpecialistQuery,
  useSpecialistsQuery,
} from "@/hooks/use-specialists-query";
import { useSpecialistCustomToolsQuery, useCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistCatalogQuery: vi.fn(),
  useSpecialistMutations: vi.fn(),
  useSpecialistQuery: vi.fn(),
  useSpecialistsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-mcp-servers-query", () => ({
  useMcpServersQuery: vi.fn(),
}));

vi.mock("@/hooks/use-custom-tools-query", () => ({
  useCustomToolsQuery: vi.fn(),
  useSpecialistCustomToolsQuery: vi.fn(),
}));

const createMutateAsync = vi.fn();
const updateMutateAsync = vi.fn();

beforeEach(() => {
  createMutateAsync.mockReset();
  updateMutateAsync.mockReset();

  vi.mocked(useSpecialistCatalogQuery).mockReturnValue({
    data: {
      builtInSkills: [],
      workspaceSkills: [],
      mcpServers: [{ name: "github", enabled: true }],
      appMcpServers: [
        {
          name: "cc_app",
          enabledByDefault: false,
          description: "CommandsCenter app-managed capabilities for this specialist.",
          tools: [
            { name: "add_secret", description: "Add a workspace secret.", context: "chat" },
            { name: "create_custom_tool", description: "Create a custom tool.", context: "chat" },
            {
              name: "copy_custom_tool_to_specialist",
              description: "Copy a custom tool.",
              context: "task_run",
            },
          ],
        },
      ],
      customTools: [],
      providerModels: [{ id: "openai/gpt-4.1", label: "openai/gpt-4.1" }],
    },
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useSpecialistsQuery).mockReturnValue({
    data: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write useful docs.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/specialists/writer",
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

  vi.mocked(useSpecialistQuery).mockReturnValue({
    data: {
      id: "agent-1",
      slug: "writer",
      name: "Writer",
      role: "write docs",
      instructions: "Write useful docs.",
      defaultModel: "openai/gpt-4.1",
      workspacePath: "/tmp/specialists/writer",
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

  vi.mocked(useSpecialistCustomToolsQuery).mockReturnValue({
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

  vi.mocked(useSpecialistMutations).mockReturnValue({
    create: { mutateAsync: createMutateAsync, isPending: false },
    update: { mutateAsync: updateMutateAsync, isPending: false },
    archive: { mutateAsync: vi.fn(), isPending: false },
  } as never);
});

describe("SpecialistEditorPage", () => {
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
          rewriteAgentsMd: false,
        },
      });
    });
  });

  it("shows Rewrite AGENTS.md unchecked by default", () => {
    renderEditor();

    expect(screen.getByRole("checkbox", { name: "Rewrite AGENTS.md on save" })).not.toBeChecked();
  });

  it("sends rewriteAgentsMd true from the instructions save action", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("checkbox", { name: "Rewrite AGENTS.md on save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes near instructions" }));

    await waitFor(() => {
      expect(updateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "agent-1",
          input: expect.objectContaining({ rewriteAgentsMd: true }),
        }),
      );
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
          rewriteAgentsMd: false,
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
              },
            ],
            appToolPermissions: [],
          }),
        }),
      });
    });
  });

  it("saves app MCP group permission when selected for custom tool helpers", async () => {
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
              },
            ],
            appToolPermissions: [],
          }),
        }),
      });
    });
  });

  it("saves per-tool CC-managed MCP permissions when toggled", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "cc_app Allow" }));

    expect(screen.getByText("Task run")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "cc_app copy_custom_tool_to_specialist" }));
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
              },
            ],
            appToolPermissions: [
              { pattern: "cc_app_copy_custom_tool_to_specialist", action: "deny" },
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

  it("redirects to the specialists page after successful update", async () => {
    updateMutateAsync.mockResolvedValue({ slug: "writer", name: "Writer" });

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Specialists route")).toBeInTheDocument();
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

  it("renders MCP servers across every runtime status", async () => {
    const baseServer = {
      enabled: true,
      config: {
        url: "https://example.com/mcp",
        transport: "streamable-http" as const,
        authMethod: "oauth" as const,
        headers: [],
      },
      tools: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: [
        { ...baseServer, id: "s1", name: "connected-srv", runtimeStatus: { status: "connected" } },
        { ...baseServer, id: "s2", name: "needsauth-srv", runtimeStatus: { status: "needs_auth" } },
        {
          ...baseServer,
          id: "s3",
          name: "failed-srv",
          runtimeStatus: { status: "failed", error: "handshake failed" },
        },
        {
          ...baseServer,
          id: "s4",
          name: "reg-srv",
          runtimeStatus: { status: "needs_client_registration", error: "register first" },
        },
        {
          ...baseServer,
          id: "s5",
          name: "disabled-srv",
          enabled: false,
          runtimeStatus: { status: "disabled" },
        },
        {
          ...baseServer,
          id: "s6",
          name: "disconnected-srv",
          runtimeStatus: { status: "disconnected" },
        },
      ],
      isLoading: false,
      error: null,
    } as never);

    renderEditor();

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Needs auth")).toBeInTheDocument();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs client registration")).toBeInTheDocument();
    expect(screen.getAllByText("Disabled").length).toBeGreaterThan(0);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    // failed / needs_client_registration surface their runtime error text.
    expect(screen.getByText("handshake failed")).toBeInTheDocument();
    expect(screen.getByText("register first")).toBeInTheDocument();
  });

  it("shows the MCP loading and error states", async () => {
    vi.mocked(useMcpServersQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("mcp down"),
    } as never);

    renderEditor();

    expect(await screen.findByText("mcp down")).toBeInTheDocument();
  });
});

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/specialists/writer/edit"]}>
      <Routes>
        <Route path="/specialists/:slug/edit" element={<SpecialistEditorPage mode="edit" />} />
        <Route path="/specialists" element={<div>Specialists route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
