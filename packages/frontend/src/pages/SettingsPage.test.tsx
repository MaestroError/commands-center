import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type * as ApiModule from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import {
  useSystemUpdateMutation,
  useSystemUpdatePreferencesMutation,
  useSystemUpdatePreferencesQuery,
  useSystemVersionQuery,
} from "@/hooks/use-system-version-query";
import { getFileManagerPreferences, updateFileManagerPreferences } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
  useSecretMutations: vi.fn(),
}));

vi.mock("@/hooks/use-system-version-query", () => ({
  useSystemVersionQuery: vi.fn(),
  useSystemUpdateMutation: vi.fn(),
  useSystemUpdatePreferencesQuery: vi.fn(),
  useSystemUpdatePreferencesMutation: vi.fn(),
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
const updateSystemMutate = vi.fn();
const updatePreferencesMutate = vi.fn();

beforeEach(() => {
  setMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  updateSystemMutate.mockReset();
  updatePreferencesMutate.mockReset();
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
  vi.mocked(useSystemVersionQuery).mockReturnValue({
    data: {
      current: "1.0.0",
      latest: "1.1.0",
      updateAvailable: true,
      installMode: "npm-global",
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
      checkedAt: "2026-05-03T00:00:00.000Z",
    },
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSystemUpdatePreferencesQuery).mockReturnValue({
    data: {
      autoUpdateEnabled: false,
      autoUpdateSource: "environment",
      environmentDefault: false,
    },
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSystemUpdateMutation).mockReturnValue({
    mutate: updateSystemMutate,
    isPending: false,
    error: null,
    data: undefined,
  } as never);
  vi.mocked(useSystemUpdatePreferencesMutation).mockReturnValue({
    mutate: updatePreferencesMutate,
    isPending: false,
    error: null,
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
  it("renders system version status and triggers updates", () => {
    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "System" })).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
    expect(screen.getByText("1.1.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply update" }));

    expect(updateSystemMutate).toHaveBeenCalledOnce();
  });

  it("allows overriding automatic updates from settings", () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Enable automatic updates/i }));

    expect(updatePreferencesMutate).toHaveBeenCalledWith({ autoUpdateEnabled: true });
  });

  it("renders searchable secrets", () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

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

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

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
