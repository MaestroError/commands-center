import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type * as ApiModule from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import { getFileManagerPreferences, updateFileManagerPreferences } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
  useSecretMutations: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return {
    ...actual,
    getFileManagerPreferences: vi.fn(),
    updateFileManagerPreferences: vi.fn(),
  };
});

const setMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();

beforeEach(() => {
  setMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  vi.mocked(useSecretsQuery).mockReturnValue({
    data: [
      { key: "CC_MCP_GITHUB_TOKEN", isSet: false, updatedAt: "2026-04-24T10:00:00.000Z" },
      { key: "CC_MCP_LINEAR_TOKEN", isSet: true, updatedAt: "2026-04-24T10:00:00.000Z" },
    ],
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSecretMutations).mockReturnValue({
    set: { mutateAsync: setMutateAsync, isPending: false },
    remove: { mutateAsync: removeMutateAsync, isPending: false },
  } as never);
  vi.mocked(getFileManagerPreferences).mockResolvedValue({
    allowHostFilesystemEdits: false,
    fileUploads: {
      maxUploadSizeBytes: 50 * 1024 * 1024,
      allowDangerousFiles: false,
    },
  });
  vi.mocked(updateFileManagerPreferences).mockImplementation((input) => Promise.resolve(input));
});

describe("SettingsPage", () => {
  it("renders searchable secrets", () => {
    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "Secrets" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_GITHUB_TOKEN")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search secrets"), { target: { value: "linear" } });

    expect(screen.queryByDisplayValue("CC_MCP_GITHUB_TOKEN")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_LINEAR_TOKEN")).toBeInTheDocument();
  });

  it("updates and deletes secrets", async () => {
    setMutateAsync.mockResolvedValue(undefined);
    removeMutateAsync.mockResolvedValue(undefined);

    renderWithQueryClient(<SettingsPage />);

    fireEvent.change(screen.getByLabelText("Value for CC_MCP_GITHUB_TOKEN"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Update" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm update" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        value: "new-secret",
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith({ key: "CC_MCP_GITHUB_TOKEN" });
    });
  });

  it("loads and updates file manager upload preferences", async () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "File Manager" }));

    expect(await screen.findByDisplayValue(String(50 * 1024 * 1024))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Allow dangerous file uploads/i }));

    await waitFor(() => {
      expect(updateFileManagerPreferences).toHaveBeenCalledWith({
        allowHostFilesystemEdits: false,
        fileUploads: {
          maxUploadSizeBytes: 50 * 1024 * 1024,
          allowDangerousFiles: true,
        },
      });
    });
  });
});

function renderWithQueryClient(element: React.ReactNode) {
  queryClient.clear();

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}
