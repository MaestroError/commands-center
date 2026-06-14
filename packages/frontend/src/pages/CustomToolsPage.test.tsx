import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomToolsPage } from "./CustomToolsPage";

import { useAgentsQuery } from "@/hooks/use-agents-query";
import {
  useAgentCustomToolsQuery,
  useCustomToolMutations,
  useCustomToolsQuery,
} from "@/hooks/use-custom-tools-query";

vi.mock("@/hooks/use-agents-query", () => ({
  useAgentsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-custom-tools-query", () => ({
  useCustomToolsQuery: vi.fn(),
  useAgentCustomToolsQuery: vi.fn(),
  useCustomToolMutations: vi.fn(),
}));

const createMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const copyToAgentsMutateAsync = vi.fn();
const copyAgentToGlobalMutateAsync = vi.fn();
const moveAgentToGlobalMutateAsync = vi.fn();
const deleteAgentToolMutateAsync = vi.fn();
const confirmSpy = vi.fn<(message?: string) => boolean>();

beforeEach(() => {
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
  copyToAgentsMutateAsync.mockReset();
  copyAgentToGlobalMutateAsync.mockReset();
  moveAgentToGlobalMutateAsync.mockReset();
  deleteAgentToolMutateAsync.mockReset();
  confirmSpy.mockReset();

  vi.spyOn(window, "confirm").mockImplementation(confirmSpy);
  confirmSpy.mockReturnValue(true);

  vi.mocked(useAgentsQuery).mockReturnValue({
    data: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write.",
        defaultModel: "openai/gpt-4.1",
        workspacePath: "/tmp/specialists/writer",
        status: "active",
        capabilities: { builtInSkills: [], customTools: [], mcpServers: [], toolPermissions: [] },
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
        slug: "release-helper-copy",
        name: "Release Helper Copy",
        description: "Draft release notes.",
        entryFile: "release-helper-copy.ts",
        entryPath: "/tmp/release-helper-copy.ts",
        fingerprint: "fp-2",
        status: "modified",
        isManaged: true,
        sourceToolSlug: "release-helper",
        sourceFingerprint: "fp-1",
        copiedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
      },
    ],
    isLoading: false,
    error: null,
  } as never);

  vi.mocked(useCustomToolMutations).mockReturnValue({
    create: { mutateAsync: createMutateAsync, isPending: false },
    delete: { mutateAsync: deleteMutateAsync, isPending: false },
    copyToAgents: { mutateAsync: copyToAgentsMutateAsync, isPending: false },
    copyAgentToGlobal: { mutateAsync: copyAgentToGlobalMutateAsync, isPending: false },
    moveAgentToGlobal: { mutateAsync: moveAgentToGlobalMutateAsync, isPending: false },
    deleteAgentTool: { mutateAsync: deleteAgentToolMutateAsync, isPending: false },
  } as never);
});

describe("CustomToolsPage", () => {
  it("keeps direct copy disabled until an agent is selected", () => {
    renderPage();

    expect(screen.getByRole("button", { name: ">>" })).toBeDisabled();
    expect(
      screen.getByText(/Tool changes apply to new chats\. Start a fresh chat/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent-1" } });

    expect(screen.getByRole("button", { name: ">>" })).toBeEnabled();
  });

  it("creates a tool and clears the form", async () => {
    createMutateAsync.mockResolvedValue({
      tool: {
        id: "tool-2",
        slug: "release-helper-v2",
        name: "Release Helper V2",
        description: "Draft better release notes.",
        entryFile: "tool.ts",
        entryPath: "/tmp/tool.ts",
        directoryPath: "/tmp/release-helper-v2",
        fingerprint: "fp-2",
        enabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        usage: [],
      },
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderPage();

    try {
      fireEvent.change(screen.getByPlaceholderText("Tool name"), {
        target: { value: "Release Helper V2" },
      });
      fireEvent.change(screen.getByPlaceholderText("Description"), {
        target: { value: "Draft better release notes." },
      });

      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(createMutateAsync).toHaveBeenCalledWith({
          name: "Release Helper V2",
          description: "Draft better release notes.",
        });
      });

      expect(screen.getByPlaceholderText("Tool name")).toHaveValue("");
      expect(screen.getByPlaceholderText("Description")).toHaveValue("");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("filters global tools by search text", () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Search tools"), {
      target: { value: "missing" },
    });

    expect(screen.getByText("No matching tools")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search tools"), {
      target: { value: "release" },
    });

    expect(screen.getByText("Release Helper")).toBeInTheDocument();
  });

  it("confirms and deletes a global tool", async () => {
    deleteMutateAsync.mockResolvedValue(undefined);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith(
        "Delete global tool 'Release Helper'? Existing agent copies will remain untouched.",
      );
      expect(deleteMutateAsync).toHaveBeenCalledWith("release-helper");
    });
  });

  it("copies a tool to selected agents from the modal", async () => {
    copyToAgentsMutateAsync.mockResolvedValue({
      copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
      warnings: [],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Copy to agents" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Copy selected agents" }));

    await waitFor(() => {
      expect(copyToAgentsMutateAsync).toHaveBeenCalledWith({
        slug: "release-helper",
        input: {
          agentIds: ["agent-1"],
          destinationName: undefined,
          overwrite: false,
        },
      });
    });
  });

  it("opens the conflict modal for direct copy and supports rename", async () => {
    copyToAgentsMutateAsync
      .mockRejectedValueOnce(
        new Error("Custom tool 'release-helper' already exists in this agent workspace."),
      )
      .mockResolvedValueOnce({
        copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
      });

    renderPage();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy to agents" }));

    expect(screen.getByText(/Newly copied tools are picked up in new chats/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: ">>" }));

    await screen.findByText("Tool name conflict");
    const rewriteButton = screen.getByRole("button", { name: "Rewrite" });
    expect(rewriteButton).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("Release Helper"), {
      target: { value: "Release Helper Variant" },
    });
    expect(rewriteButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Copy with new name" }));

    await waitFor(() => {
      expect(copyToAgentsMutateAsync).toHaveBeenLastCalledWith({
        slug: "release-helper",
        input: {
          agentIds: ["agent-1"],
          destinationName: "Release Helper Variant",
          overwrite: false,
        },
      });
    });
  });

  it("confirms and removes an agent-local tool", async () => {
    deleteAgentToolMutateAsync.mockResolvedValue(undefined);

    renderPage();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await screen.findByText("Remove agent-local tool");
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove$/ })[1]!);

    await waitFor(() => {
      expect(deleteAgentToolMutateAsync).toHaveBeenCalledWith({
        agentId: "agent-1",
        slug: "release-helper-copy",
      });
    });
  });

  it("opens the global conflict modal for an agent tool and supports rename", async () => {
    copyAgentToGlobalMutateAsync
      .mockRejectedValueOnce(
        new Error("Custom tool 'release-helper-copy' already exists globally."),
      )
      .mockResolvedValueOnce({
        tool: {
          id: "tool-3",
          slug: "release-helper-copy-variant",
          name: "Release Helper Copy Variant",
          description: "Draft release notes.",
          entryFile: "tool.ts",
          entryPath: "/tmp/tool.ts",
          directoryPath: "/tmp/release-helper-copy-variant",
          fingerprint: "fp-3",
          enabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          warnings: [],
          usage: [],
        },
        overwritten: false,
        warnings: [],
      });

    renderPage();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy to global" }));

    await screen.findByText("Tool name conflict");
    fireEvent.change(screen.getByDisplayValue("Release Helper Copy"), {
      target: { value: "Release Helper Global" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy with new name" }));

    await waitFor(() => {
      expect(copyAgentToGlobalMutateAsync).toHaveBeenLastCalledWith({
        agentId: "agent-1",
        slug: "release-helper-copy",
        input: {
          destinationName: "Release Helper Global",
          overwrite: false,
        },
      });
    });
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CustomToolsPage />
    </MemoryRouter>,
  );
}
