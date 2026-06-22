import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type * as ApiModule from "@/lib/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import {
  useEngineRestartMutation,
  useEngineStatusQuery,
  useMarkEngineRestarting,
} from "@/hooks/use-engine-status-query";
import {
  useSystemVersionCheckMutation,
  useSystemUpdateMutation,
  useSystemUpdatePreferencesMutation,
  useSystemUpdatePreferencesQuery,
  useSystemVersionQuery,
} from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import {
  getFileManagerPreferences,
  getTaskArtifactSharingPreferences,
  getTaskRunMonitorSettings,
  updateFileManagerPreferences,
  updateTaskArtifactSharingPreferences,
  updateTaskRunMonitorSettings,
} from "@/lib/api";
import { queryClient } from "@/lib/query-client";

vi.mock("@/hooks/use-secrets-query", () => ({
  useSecretsQuery: vi.fn(),
  useSecretMutations: vi.fn(),
}));

vi.mock("@/hooks/use-system-version-query", () => ({
  useSystemVersionQuery: vi.fn(),
  useSystemVersionCheckMutation: vi.fn(),
  useSystemUpdateMutation: vi.fn(),
  useSystemUpdatePreferencesQuery: vi.fn(),
  useSystemUpdatePreferencesMutation: vi.fn(),
}));

vi.mock("@/hooks/use-engine-status-query", () => ({
  useEngineStatusQuery: vi.fn(),
  useEngineRestartMutation: vi.fn(),
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
    getTaskArtifactSharingPreferences: vi.fn(),
    updateTaskArtifactSharingPreferences: vi.fn(),
    getTaskRunMonitorSettings: vi.fn(),
    updateTaskRunMonitorSettings: vi.fn(),
  };
});

const setMutateAsync = vi.fn();
const removeMutateAsync = vi.fn();
const checkVersionMutate = vi.fn();
const updateSystemMutate = vi.fn();
const updatePreferencesMutate = vi.fn();
const markEngineRestarting = vi.fn();
const restartEngineMutate = vi.fn();

beforeEach(() => {
  setMutateAsync.mockReset();
  removeMutateAsync.mockReset();
  checkVersionMutate.mockReset();
  updateSystemMutate.mockReset();
  updatePreferencesMutate.mockReset();
  markEngineRestarting.mockReset();
  restartEngineMutate.mockReset();
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
  vi.mocked(useEngineStatusQuery).mockReturnValue({
    data: {
      state: "healthy",
      healthy: true,
      url: "http://127.0.0.1:4100",
      workspaceDir: "/tmp/workspace",
      version: "1.16.2",
      binarySource: "dependency",
      restartCount: 0,
      maxRestarts: 3,
    },
    isLoading: false,
    error: null,
  } as never);
  vi.mocked(useEngineRestartMutation).mockReturnValue({
    mutate: restartEngineMutate,
    isPending: false,
    error: null,
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
  vi.mocked(useSystemVersionCheckMutation).mockReturnValue({
    mutate: checkVersionMutate,
    isPending: false,
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
  vi.mocked(getTaskArtifactSharingPreferences).mockResolvedValue({
    taskArtifactSignedUrlExpiresInMinutes: 1440,
  });
  vi.mocked(getTaskRunMonitorSettings).mockResolvedValue({
    taskRunMonitorMaxLifetimeMinutes: 360,
    taskRunMonitorNoProgressTimeoutMinutes: 30,
    taskRunMonitorRequeueAfterStall: false,
    taskRunMonitorRequeueLimit: 10,
    taskRunMaxAutoRetries: 10,
  });
  vi.mocked(updateTaskRunMonitorSettings).mockImplementation((input) => Promise.resolve(input));
  vi.mocked(updateTaskArtifactSharingPreferences).mockImplementation((input) =>
    Promise.resolve(input),
  );
});

describe("SettingsPage", () => {
  it("renders system version status and triggers update actions", () => {
    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByRole("tab", { name: "System" })).toBeInTheDocument();
    expect(screen.getByText("Opencode engine")).toBeInTheDocument();
    expect(screen.getByText("1.16.2")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
    expect(screen.getByText("1.1.0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(checkVersionMutate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Apply update" }));

    expect(updateSystemMutate).toHaveBeenCalledOnce();
  });

  it("restarts the opencode engine from the system tab after confirmation", () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Restart instance" }));
    expect(restartEngineMutate).not.toHaveBeenCalled();

    expect(screen.getByText("Restart Opencode engine?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm restart" }));

    expect(restartEngineMutate).toHaveBeenCalledOnce();
  });

  it("shows the pending manual version check state", () => {
    vi.mocked(useSystemVersionCheckMutation).mockReturnValue({
      mutate: checkVersionMutate,
      isPending: true,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        value: "new-secret",
        restart: true,
      });
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        restart: true,
      });
    });
  });

  it("updates a secret without restarting when choosing to restart later", async () => {
    setMutateAsync.mockResolvedValue(undefined);

    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

    fireEvent.change(screen.getByLabelText("Value for CC_MCP_GITHUB_TOKEN"), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Update" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "I'll restart later" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        value: "new-secret",
        restart: false,
      });
    });

    expect(markEngineRestarting).not.toHaveBeenCalled();
  });

  it("deletes a secret without restarting when choosing to restart later", async () => {
    removeMutateAsync.mockResolvedValue(undefined);

    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Secrets" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "I'll restart later" }));

    await waitFor(() => {
      expect(removeMutateAsync).toHaveBeenCalledWith({
        key: "CC_MCP_GITHUB_TOKEN",
        restart: false,
      });
    });

    expect(markEngineRestarting).not.toHaveBeenCalled();
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
    expect(setMutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MANUAL_TOKEN",
        value: "manual-secret",
        restart: true,
      });
    });

    expect(markEngineRestarting).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Secret key")).not.toBeInTheDocument();
  });

  it("creates a new secret without restarting when choosing to restart later", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "I'll restart later" }));

    await waitFor(() => {
      expect(setMutateAsync).toHaveBeenCalledWith({
        key: "CC_MANUAL_TOKEN",
        value: "manual-secret",
        restart: false,
      });
    });

    expect(markEngineRestarting).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

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

  it("loads and updates task run monitor settings", async () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Tasks" }));

    expect(await screen.findByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("360")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/No-progress \(stall\) timeout/i), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Max run lifetime/i), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Requeue task after stall timeout/i }));
    // The requeue limit field appears only once requeue is enabled.
    fireEvent.change(await screen.findByLabelText(/Requeue limit/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save task settings" }));

    await waitFor(() => {
      expect(updateTaskRunMonitorSettings).toHaveBeenCalledWith({
        taskRunMonitorMaxLifetimeMinutes: 120,
        taskRunMonitorNoProgressTimeoutMinutes: 10,
        taskRunMonitorRequeueAfterStall: true,
        taskRunMonitorRequeueLimit: 5,
        taskRunMaxAutoRetries: 10,
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
      data: [
        { id: "run-1", status: "running" },
        { id: "run-2", status: "running" },
      ],
      isLoading: false,
      error: null,
    } as never);

    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByText(/2 active task runs are in progress/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Apply update" })).toBeDisabled();
  });

  it("shows manual update check errors", () => {
    vi.mocked(useSystemVersionCheckMutation).mockReturnValue({
      mutate: checkVersionMutate,
      isPending: false,
      error: new Error("registry unavailable"),
    } as never);

    renderWithQueryClient(<SettingsPage />);

    expect(screen.getByText("Update check failed.")).toBeInTheDocument();
    expect(screen.getByText("registry unavailable")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Restart now" }));

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

describe("SettingsPage sharing tab", () => {
  it("loads and saves artifact sharing preferences", async () => {
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Sharing" }));

    // Loaded preference value is reflected in the input.
    const input = await screen.findByRole("spinbutton");
    expect(input).toHaveValue(1440);

    fireEvent.change(input, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save sharing settings" }));

    await waitFor(() =>
      expect(updateTaskArtifactSharingPreferences).toHaveBeenCalledWith({
        taskArtifactSignedUrlExpiresInMinutes: 60,
      }),
    );
  });

  it("surfaces an error when saving sharing preferences fails", async () => {
    vi.mocked(updateTaskArtifactSharingPreferences).mockRejectedValueOnce(new Error("save failed"));
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Sharing" }));
    await screen.findByRole("spinbutton");

    fireEvent.click(screen.getByRole("button", { name: "Save sharing settings" }));

    expect(await screen.findByText("save failed")).toBeInTheDocument();
  });

  it("surfaces an error when loading sharing preferences fails", async () => {
    vi.mocked(getTaskArtifactSharingPreferences).mockRejectedValueOnce(new Error("load failed"));
    renderWithQueryClient(<SettingsPage />);

    fireEvent.click(screen.getByRole("tab", { name: "Sharing" }));

    expect(await screen.findByText("load failed")).toBeInTheDocument();
  });
});

function renderWithQueryClient(element: React.ReactNode) {
  queryClient.clear();

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}
