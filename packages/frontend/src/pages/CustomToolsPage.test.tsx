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

beforeEach(() => {
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
  copyToAgentsMutateAsync.mockReset();
  copyAgentToGlobalMutateAsync.mockReset();
  moveAgentToGlobalMutateAsync.mockReset();
  deleteAgentToolMutateAsync.mockReset();

  vi.mocked(useAgentsQuery).mockReturnValue({
    data: [
      {
        id: "agent-1",
        slug: "writer",
        name: "Writer",
        role: "write docs",
        instructions: "Write.",
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

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "agent-1" } });

    expect(screen.getByRole("button", { name: ">>" })).toBeEnabled();
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
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CustomToolsPage />
    </MemoryRouter>,
  );
}
