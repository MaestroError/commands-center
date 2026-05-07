import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type * as ApiModule from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import { useMarkEngineRestarting } from "@/hooks/use-engine-status-query";
import {
  useSystemUpdateMutation,
  useSystemUpdatePreferencesMutation,
  useSystemUpdatePreferencesQuery,
  useSystemVersionQuery,
} from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
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

vi.mock("@/hooks/use-engine-status-query", () => ({
  useMarkEngineRestarting: vi.fn(),
}));

vi.mock("@/hooks/use-tasks-query", () => ({
  useActiveTaskRunsQuery: vi.fn(),
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
const markEngineRestarting = vi.fn();

beforeEach(() => {
  setMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  updateSystemMutate.mockReset();
  updatePreferencesMutate.mockReset();
  markEngineRestarting.mockReset();
  vi.mocked(getFileManagerPreferences).mockReset();
  vi.mocked(updateFileManagerPreferences).mockReset();
  vi.mocked(useSecretsQuery).mockReturnValue({
    data: [
      {
        key: "CC_MCP_GITHUB_TOKEN",
        isSet: false,
        stale: false,
        updatedAt: "2026-04-24T10:00:00.000Z",
      },
      {
        key: "CC_MCP_LINEAR_TOKEN",
        isSet: true,
        stale: false,
        updatedAt: "2026-04-24T10:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useSecretMutations).mockReturnValue({
    set: { mutateAsync: setMutateAsync, isPending: false },
    remove: { mutateAsync: removeMutateAsync, isPending: false },
  } as never);
  vi.mocked(useMarkEngineRestarting).mockReturnValue(markEngineRestarting);
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
  vi.mocked(useActiveTaskRunsQuery).mockReturnValue({
    data: [],
    isLoading: false,
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
    expect(screen.getByRole("button", { name: "Add secret" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_GITHUB_TOKEN")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search secrets"), { target: { value: "linear" } });

    expect(screen.queryByDisplayValue("CC_MCP_GITHUB_TOKEN")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("CC_MCP_LINEAR_TOKEN")).toBeInTheDocument();
  });

  it("shows stale secret guidance while keeping the secret unavailable", () => {
    vi.mocked(useSecretsQuery).mockReturnValue({
      data: [
        {
          key: "CC_MCP_STALE_TOKEN",
          isSet: false,
          stale: true,
          updatedAt: "2026-04-24T10:00:00.000Z",
        },
      ],
      isLoading: false,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

    expect(
      screen.getByText(
        "This secret was encrypted with an older key and is unavailable until you save a new value.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter a new value to replace the stale secret"),
    ).toBeInTheDocument();
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

  it("creates a new secret manually", async () => {
    setMutateAsync.mockResolvedValue(undefined);

    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.click(screen.getByRole("button", { name: "Add secret" }));
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "CC_MANUAL_TOKEN" },
    });
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "manual-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save secret" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MANUAL_TOKEN",
        value: "manual-secret",
      });
    });

    expect(markEngineRestarting).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Secret key")).not.toBeInTheDocument();
  });

  it("prevents creating a duplicate secret key", () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.click(screen.getByRole("button", { name: "Add secret" }));
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "CC_MCP_GITHUB_TOKEN" },
    });
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "manual-secret" },
    });

    expect(screen.getByText("Secret already exists. Update it below.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save secret" })).toBeDisabled();
    expect(setMutateAsync).not.toHaveBeenCalled();
  });

  it("shows a fallback error when creating a secret fails", async () => {
    setMutateAsync.mockRejectedValue("failed");

    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.click(screen.getByRole("button", { name: "Add secret" }));
    fireEvent.change(screen.getByLabelText("Secret key"), {
      target: { value: "CC_MANUAL_TOKEN" },
    });
    fireEvent.change(screen.getByLabelText("Secret value"), {
      target: { value: "manual-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save secret" }));

    expect(await screen.findByText("Request failed.")).toBeInTheDocument();
    expect(markEngineRestarting).not.toHaveBeenCalled();
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

  it("renders docker-specific system guidance and disables workspace auto-updates", () => {
    vi.mocked(useSystemVersionQuery).mockReturnValue({
      data: {
        current: "1.0.0",
        latest: "1.0.0",
        updateAvailable: false,
        installMode: "docker",
        autoUpdateEnabled: false,
        autoUpdateSource: "settings",
        checkedAt: "2026-05-03T00:00:00.000Z",
      },
      isLoading: false,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByText("Docker updates are operator-managed")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Enable automatic updates/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Apply update" })).not.toBeInTheDocument();
  });

  it("disables applying updates while active task runs are in progress", () => {
    vi.mocked(useActiveTaskRunsQuery).mockReturnValue({
      data: [{ id: "run-1" }, { id: "run-2" }],
      isLoading: false,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByText(/2 active task runs are in progress/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply update" })).toBeDisabled();
  });

  it("shows an empty state when no secrets exist", () => {
    vi.mocked(useSecretsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

    expect(screen.getByText("No secrets yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No secrets exist yet. Add one manually or create an MCP variable reference.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a filtered empty state when secret search has no matches", () => {
    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.change(screen.getByLabelText("Search secrets"), { target: { value: "missing" } });

    expect(screen.getByText("No matching secrets")).toBeInTheDocument();
  });

  it("reveals and hides secret values on demand", () => {
    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

    const input = screen.getByLabelText("Value for CC_MCP_GITHUB_TOKEN");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show CC_MCP_GITHUB_TOKEN" }));
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide CC_MCP_GITHUB_TOKEN" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows a fallback error when deleting a secret fails", async () => {
    removeMutateAsync.mockRejectedValue("failed");

    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(await screen.findByText("Request failed.")).toBeInTheDocument();
    expect(markEngineRestarting).not.toHaveBeenCalled();
  });

  it("marks the engine restarting after a secret update succeeds", async () => {
    setMutateAsync.mockResolvedValue(undefined);

    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));
    fireEvent.change(screen.getByLabelText("Value for CC_MCP_GITHUB_TOKEN"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Update" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Confirm update" }));

    await waitFor(() => {
      expect(markEngineRestarting).toHaveBeenCalledOnce();
    });
  });

  it("shows file manager load errors", async () => {
    vi.mocked(getFileManagerPreferences).mockRejectedValue(new Error("load failed"));

    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "File Manager" }));

    expect(await screen.findByText("Could not save preferences.")).toBeInTheDocument();
    expect(screen.getByText("load failed")).toBeInTheDocument();
  });

  it("does not save invalid file manager upload sizes", async () => {
    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "File Manager" }));

    const input = await screen.findByDisplayValue(String(50 * 1024 * 1024));
    fireEvent.change(input, { target: { value: "0" } });

    expect(updateFileManagerPreferences).not.toHaveBeenCalled();
  });

  it("shows file manager save errors", async () => {
    vi.mocked(updateFileManagerPreferences).mockRejectedValue(new Error("save failed"));

    renderWithQueryClient(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "File Manager" }));

    const input = await screen.findByRole("checkbox", {
      name: /Allow editing files on the host filesystem/i,
    });
    fireEvent.click(input);

    expect(await screen.findByText("save failed")).toBeInTheDocument();
  });
});

function renderWithQueryClient(element: React.ReactNode) {
  queryClient.clear();

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}
