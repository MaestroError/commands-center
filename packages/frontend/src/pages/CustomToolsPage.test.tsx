import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomToolsPage } from "./CustomToolsPage";

import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useSpecialistCustomToolsQuery,
  useCustomToolMutations,
  useCustomToolsQuery,
} from "@/hooks/use-custom-tools-query";

vi.mock("@/hooks/use-specialists-query", () => ({
  useSpecialistsQuery: vi.fn(),
}));

vi.mock("@/hooks/use-custom-tools-query", () => ({
  useCustomToolsQuery: vi.fn(),
  useSpecialistCustomToolsQuery: vi.fn(),
  useCustomToolMutations: vi.fn(),
}));

const createMutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
const copyToSpecialistsMutateAsync = vi.fn();
const copySpecialistToGlobalMutateAsync = vi.fn();
const moveSpecialistToGlobalMutateAsync = vi.fn();
const deleteSpecialistToolMutateAsync = vi.fn();
const confirmSpy = vi.fn<(message?: string) => boolean>();

beforeEach(() => {
  createMutateAsync.mockReset();
  deleteMutateAsync.mockReset();
  copyToSpecialistsMutateAsync.mockReset();
  copySpecialistToGlobalMutateAsync.mockReset();
  moveSpecialistToGlobalMutateAsync.mockReset();
  deleteSpecialistToolMutateAsync.mockReset();
  confirmSpy.mockReset();

  vi.spyOn(window, "confirm").mockImplementation(confirmSpy);
  confirmSpy.mockReturnValue(true);

  vi.mocked(useSpecialistsQuery).mockReturnValue({
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

  vi.mocked(useSpecialistCustomToolsQuery).mockReturnValue({
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
    copyToSpecialists: { mutateAsync: copyToSpecialistsMutateAsync, isPending: false },
    copySpecialistToGlobal: { mutateAsync: copySpecialistToGlobalMutateAsync, isPending: false },
    moveSpecialistToGlobal: { mutateAsync: moveSpecialistToGlobalMutateAsync, isPending: false },
    deleteSpecialistTool: { mutateAsync: deleteSpecialistToolMutateAsync, isPending: false },
  } as never);
});

describe("CustomToolsPage", () => {
  it("keeps direct copy disabled until a specialist is selected", () => {
    renderPage();

    expect(screen.getByRole("button", { name: ">>" })).toBeDisabled();
    expect(
      screen.getByText(/Tool changes apply to new chats\. Start a fresh chat/i),
    ).toBeInTheDocument();

    selectWriter();

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
        "Delete global tool 'Release Helper'? Existing specialist copies will remain untouched.",
      );
      expect(deleteMutateAsync).toHaveBeenCalledWith("release-helper");
    });
  });

  it("copies a tool to selected specialists from the modal", async () => {
    copyToSpecialistsMutateAsync.mockResolvedValue({
      copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
      warnings: [],
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Copy to specialists" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Copy selected specialists" }));

    await waitFor(() => {
      expect(copyToSpecialistsMutateAsync).toHaveBeenCalledWith({
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
    copyToSpecialistsMutateAsync
      .mockRejectedValueOnce(
        new Error("Custom tool 'release-helper' already exists in this specialist workspace."),
      )
      .mockResolvedValueOnce({
        copied: [{ agentId: "agent-1", agentSlug: "writer", overwritten: false }],
      });

    renderPage();
    selectWriter();
    fireEvent.click(screen.getByRole("button", { name: "Copy to specialists" }));

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
      expect(copyToSpecialistsMutateAsync).toHaveBeenLastCalledWith({
        slug: "release-helper",
        input: {
          agentIds: ["agent-1"],
          destinationName: "Release Helper Variant",
          overwrite: false,
        },
      });
    });
  });

  it("confirms and removes a specialist-local tool", async () => {
    deleteSpecialistToolMutateAsync.mockResolvedValue(undefined);

    renderPage();
    selectWriter();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await screen.findByText("Remove specialist-local tool");
    fireEvent.click(screen.getAllByRole("button", { name: /^Remove$/ })[1]!);

    await waitFor(() => {
      expect(deleteSpecialistToolMutateAsync).toHaveBeenCalledWith({
        agentId: "agent-1",
        slug: "release-helper-copy",
      });
    });
  });

  it("opens the global conflict modal for a specialist tool and supports rename", async () => {
    copySpecialistToGlobalMutateAsync
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
    selectWriter();
    fireEvent.click(screen.getByRole("button", { name: "Copy to global" }));

    await screen.findByText("Tool name conflict");
    fireEvent.change(screen.getByDisplayValue("Release Helper Copy"), {
      target: { value: "Release Helper Global" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy with new name" }));

    await waitFor(() => {
      expect(copySpecialistToGlobalMutateAsync).toHaveBeenLastCalledWith({
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

function selectWriter(): void {
  fireEvent.focus(screen.getByRole("combobox", { name: "Specialist tools" }));
  fireEvent.click(screen.getByRole("option", { name: "Writer" }));
}
