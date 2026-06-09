import { useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { PasswordInput } from "@/components/common/PasswordInput";
import { TabBar } from "@/components/common/TabBar";
import {
  useEngineRestartMutation,
  useEngineStatusQuery,
  useMarkEngineRestarting,
} from "@/hooks/use-engine-status-query";
import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
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
  updateFileManagerPreferences,
  updateTaskArtifactSharingPreferences,
} from "@/lib/api";

export function SettingsPage() {
  const [activeTabId, setActiveTabId] = useState("system");
  const tabs = useMemo(
    () => [
      {
        id: "system",
        label: "System",
      },
      {
        id: "secrets",
        label: "Secrets",
      },
      {
        id: "file-manager",
        label: "File Manager",
      },
      {
        id: "sharing",
        label: "Sharing",
      },
    ],
    [],
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Manage workspace-level runtime configuration and encrypted secret values."
        eyebrow="Settings"
        title="Settings"
      />
      <section className="cc-panel p-6">
        <TabBar activeTabId={activeTabId} onTabChange={setActiveTabId} tabs={tabs} />
        {activeTabId === "system" ? <SystemTab /> : null}
        {activeTabId === "secrets" ? (
          <SecretsTab onShowSystemTab={() => setActiveTabId("system")} />
        ) : null}
        {activeTabId === "file-manager" ? <FileManagerTab /> : null}
        {activeTabId === "sharing" ? <SharingTab /> : null}
      </section>
    </div>
  );
}

function ConfirmDialog(props: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
      onClick={props.onCancel}
    >
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="cc-panel w-full max-w-lg p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-xl font-semibold text-text-primary" id="confirm-dialog-title">
          {props.title}
        </h2>
        <div className="mt-3 text-sm leading-6 text-text-secondary">{props.description}</div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className={
              props.confirmVariant === "danger" ? "cc-button cc-button-danger" : "cc-button"
            }
            onClick={props.onConfirm}
            type="button"
          >
            {props.confirmLabel}
          </button>
          {props.secondaryLabel && props.onSecondary ? (
            <button
              className="cc-button cc-button-secondary"
              onClick={props.onSecondary}
              type="button"
            >
              {props.secondaryLabel}
            </button>
          ) : null}
          <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function SecretRestartNotice(props: { onShowSystemTab: () => void }) {
  return (
    <p>
      Restarting the AI engine is required for this secret change to take effect. You can restart
      now, or restart later from the System tab in{" "}
      <button
        className="font-medium text-accent underline-offset-4 hover:underline"
        onClick={props.onShowSystemTab}
        type="button"
      >
        Settings
      </button>
      . Restarting interrupts any active agent sessions briefly.
    </p>
  );
}

function SystemTab() {
  const engineQuery = useEngineStatusQuery();
  const engineRestartMutation = useEngineRestartMutation();
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const versionQuery = useSystemVersionQuery();
  const versionCheckMutation = useSystemVersionCheckMutation();
  const preferencesQuery = useSystemUpdatePreferencesQuery();
  const preferencesMutation = useSystemUpdatePreferencesMutation();
  const updateMutation = useSystemUpdateMutation();
  const activeRunsQuery = useActiveTaskRunsQuery();
  const version = versionQuery.data;
  const preferences = preferencesQuery.data;
  const activeRunCount =
    activeRunsQuery.data?.filter((run) => run.status === "running").length ?? 0;
  const error =
    versionQuery.error instanceof Error
      ? versionQuery.error.message
      : (version?.error ?? undefined);
  const preferencesError =
    preferencesQuery.error instanceof Error ? preferencesQuery.error.message : undefined;
  const preferencesMutationError =
    preferencesMutation.error instanceof Error ? preferencesMutation.error.message : undefined;
  const updateError =
    updateMutation.error instanceof Error ? updateMutation.error.message : undefined;
  const versionCheckError =
    versionCheckMutation.error instanceof Error ? versionCheckMutation.error.message : undefined;
  const engineError =
    engineQuery.error instanceof Error
      ? engineQuery.error.message
      : engineRestartMutation.error instanceof Error
        ? engineRestartMutation.error.message
        : undefined;
  const updateResult = updateMutation.data;
  const engine = engineQuery.data;
  const engineRestartDisabled =
    engineRestartMutation.isPending || engine?.state === "starting" || engine?.state === "stopping";

  return (
    <div className="mt-6 grid gap-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">System Updates</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Check the installed CommandsCenter version and apply safe updates for this installation.
        </p>
      </div>

      <article className="grid gap-5 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Opencode engine</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Runtime status for the local AI engine instance.
            </p>
          </div>
          <button
            className="cc-button cc-button-secondary shrink-0 whitespace-nowrap sm:w-auto"
            disabled={engineRestartDisabled}
            onClick={() => setConfirmingRestart(true)}
            type="button"
          >
            {engineRestartMutation.isPending ? "Restarting..." : "Restart instance"}
          </button>
        </div>

        {engineQuery.isLoading ? <LoadingState testId="engine-status-loading" /> : null}
        {engine ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <VersionMetric label="Engine Version" value={engine.version ?? "Unknown"} />
            <VersionMetric label="State" value={formatEngineState(engine.state)} />
            <VersionMetric label="Source" value={formatEngineSource(engine.binarySource)} />
            <VersionMetric label="Endpoint" value={engine.url} />
          </div>
        ) : null}
        {engineError ? (
          <ErrorState description={engineError} title="Opencode engine status failed." />
        ) : null}
      </article>

      {versionQuery.isLoading || preferencesQuery.isLoading ? (
        <LoadingState testId="system-version-loading" />
      ) : null}
      {error ? (
        <ErrorState description={error} title="Version status could not be refreshed." />
      ) : null}
      {preferencesError ? (
        <ErrorState
          description={preferencesError}
          title="Update preferences could not be loaded."
        />
      ) : null}

      {version ? (
        <article className="grid gap-5 rounded-xl border border-border bg-surface p-5">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">CommandsCenter</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Installed version and available updates for this installation.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <VersionMetric label="Current" value={version.current} />
            <VersionMetric label="Latest" value={version.latest ?? "Unknown"} />
            <VersionMetric label="Install Mode" value={formatInstallMode(version.installMode)} />
            <VersionMetric
              label="Status"
              value={version.updateAvailable ? "Update available" : "Up to date"}
            />
          </div>

          {preferences ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-app-bg p-4">
              <input
                checked={preferences.autoUpdateEnabled}
                className="mt-1"
                disabled={preferencesMutation.isPending || version.installMode === "docker"}
                onChange={(event) =>
                  preferencesMutation.mutate({ autoUpdateEnabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <span className="block font-medium text-text-primary">
                  Enable automatic updates
                </span>
                <span className="mt-1 block text-sm leading-6 text-text-secondary">
                  Overrides <code>CC_AUTO_UPDATE</code> from this workspace. Current source:{" "}
                  {preferences.autoUpdateSource === "settings" ? "Settings" : "Environment"}.
                  {version.installMode === "docker"
                    ? " Docker installations never auto-update from inside the container."
                    : " When enabled, CommandsCenter applies npm updates after a new version is detected."}
                </span>
              </span>
            </label>
          ) : null}

          {preferencesMutationError ? (
            <ErrorState
              description={preferencesMutationError}
              title="Auto-update setting failed."
            />
          ) : null}

          {version.checkedAt ? (
            <p className="text-xs text-text-secondary">
              Last checked {new Date(version.checkedAt).toLocaleString()}.
            </p>
          ) : null}
          {versionCheckError ? (
            <ErrorState description={versionCheckError} title="Update check failed." />
          ) : null}
          <div className="flex justify-end">
            <button
              className="cc-button cc-button-secondary shrink-0 whitespace-nowrap sm:w-auto"
              disabled={versionCheckMutation.isPending}
              onClick={() => versionCheckMutation.mutate()}
              type="button"
            >
              {versionCheckMutation.isPending ? "Checking..." : "Check for updates"}
            </button>
          </div>

          {version.installMode === "docker" ? (
            <div className="rounded-lg border border-border bg-app-bg p-4">
              <h3 className="font-medium text-text-primary">Docker updates are operator-managed</h3>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Containers cannot safely replace their own image. Pull the newest image and restart
                the service from the host.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-muted p-3 text-xs text-text-primary">
                docker compose pull{"\n"}docker compose up -d
              </pre>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-app-bg p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium text-text-primary">
                  {version.updateAvailable
                    ? "A newer version is ready"
                    : "No update is currently available"}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {version.updateAvailable
                    ? "CommandsCenter will install the latest package, drain active services, and exit so your process manager can restart it."
                    : "You can still run the updater to reinstall the current package version."}
                </p>
                {activeRunCount > 0 ? (
                  <p className="mt-2 text-sm text-amber-300">
                    {activeRunCount} active task {activeRunCount === 1 ? "run is" : "runs are"} in
                    progress. Wait for active task work to finish before applying updates.
                  </p>
                ) : null}
              </div>
              <button
                className="cc-button shrink-0 whitespace-nowrap sm:w-auto"
                disabled={updateMutation.isPending || activeRunCount > 0}
                onClick={() => updateMutation.mutate()}
                type="button"
              >
                {updateMutation.isPending ? "Applying update..." : "Apply update"}
              </button>
            </div>
          )}
        </article>
      ) : null}

      {updateResult ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-text-primary">
          <p>{updateResult.message}</p>
          {updateResult.instructions?.length ? (
            <ul className="mt-2 list-disc pl-5 text-text-secondary">
              {updateResult.instructions.map((instruction) => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {updateError ? <ErrorState description={updateError} title="Update failed." /> : null}

      {confirmingRestart ? (
        <ConfirmDialog
          confirmLabel="Confirm restart"
          description="The AI engine will be restarted. This may take a few minutes, and this instance will not be available until the restart finishes. Any active agent sessions will be interrupted."
          onCancel={() => setConfirmingRestart(false)}
          onConfirm={() => {
            setConfirmingRestart(false);
            engineRestartMutation.mutate();
          }}
          title="Restart Opencode engine?"
        />
      ) : null}
    </div>
  );
}

function formatEngineState(state: string) {
  if (state === "healthy") {
    return "Running";
  }

  if (state === "starting") {
    return "Starting";
  }

  if (state === "stopping") {
    return "Stopping";
  }

  if (state === "unhealthy") {
    return "Unhealthy";
  }

  return "Stopped";
}

function formatEngineSource(source: "dependency" | "override" | undefined) {
  if (source === "dependency") {
    return "Bundled dependency";
  }

  if (source === "override") {
    return "Configured override";
  }

  return "Unknown";
}

function VersionMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-app-bg p-4">
      <dt className="text-xs uppercase tracking-[0.2em] text-text-muted">{props.label}</dt>
      <dd className="mt-2 break-words font-medium text-text-primary">{props.value}</dd>
    </div>
  );
}

function formatInstallMode(mode: "docker" | "npm-global" | "npm-local") {
  if (mode === "npm-global") {
    return "NPM global";
  }

  if (mode === "npm-local") {
    return "NPM local";
  }

  return "Docker";
}

function FileManagerTab() {
  const [preferences, setPreferences] = useState<{
    allowHostFilesystemEdits: boolean;
    fileUploads: {
      maxUploadSizeBytes: number;
      allowDangerousFiles: boolean;
    };
  }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void getFileManagerPreferences()
      .then((preferences) => {
        if (cancelled) return;
        setPreferences(preferences);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load preferences.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function updatePreferences(next: {
    allowHostFilesystemEdits?: boolean;
    maxUploadSizeBytes?: number;
    allowDangerousFiles?: boolean;
  }) {
    if (!preferences) {
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const result = await updateFileManagerPreferences({
        allowHostFilesystemEdits:
          next.allowHostFilesystemEdits ?? preferences.allowHostFilesystemEdits,
        fileUploads: {
          maxUploadSizeBytes: next.maxUploadSizeBytes ?? preferences.fileUploads.maxUploadSizeBytes,
          allowDangerousFiles:
            next.allowDangerousFiles ?? preferences.fileUploads.allowDangerousFiles,
        },
      });
      setPreferences(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState testId="file-manager-preferences-loading" />;
  }

  return (
    <div className="mt-6 grid gap-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">File Manager</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Control how the in-app editor interacts with files outside the workspace.
        </p>
      </div>
      {error ? <ErrorState description={error} title="Could not save preferences." /> : null}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <input
          checked={preferences?.allowHostFilesystemEdits ?? false}
          className="mt-1"
          disabled={saving}
          onChange={(event) =>
            void updatePreferences({ allowHostFilesystemEdits: event.target.checked })
          }
          type="checkbox"
        />
        <span>
          <span className="block font-medium text-text-primary">
            Allow editing files on the host filesystem
          </span>
          <span className="mt-1 block text-sm text-text-secondary">
            When disabled, files browsed from the Host Filesystem root are read-only in the editor.
            The Workspace and All Agents roots remain editable regardless of this setting.
          </span>
        </span>
      </label>
      <label className="grid gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-text-primary">
        <span className="font-medium">Max upload size (bytes)</span>
        <input
          className="cc-input"
          disabled={saving}
          min={1}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value) && value > 0) {
              void updatePreferences({ maxUploadSizeBytes: value });
            }
          }}
          type="number"
          value={preferences?.fileUploads.maxUploadSizeBytes ?? 50 * 1024 * 1024}
        />
        <span className="text-text-secondary">
          File uploads larger than this limit are rejected by the backend.
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-4">
        <input
          checked={preferences?.fileUploads.allowDangerousFiles ?? false}
          className="mt-1"
          disabled={saving}
          onChange={(event) =>
            void updatePreferences({ allowDangerousFiles: event.target.checked })
          }
          type="checkbox"
        />
        <span>
          <span className="block font-medium text-text-primary">Allow dangerous file uploads</span>
          <span className="mt-1 block text-sm text-text-secondary">
            When disabled, archive, executable, installer, shell, and disk image file types are
            rejected.
          </span>
        </span>
      </label>
    </div>
  );
}

function SharingTab() {
  const [expiresInMinutes, setExpiresInMinutes] = useState(1440);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void getTaskArtifactSharingPreferences()
      .then((preferences) => {
        if (cancelled) return;
        setExpiresInMinutes(preferences.taskArtifactSignedUrlExpiresInMinutes);
        setLoading(false);
      })
      .catch((nextError: unknown) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load preferences.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePreferences() {
    setSaving(true);
    setError(undefined);
    try {
      const preferences = await updateTaskArtifactSharingPreferences({
        taskArtifactSignedUrlExpiresInMinutes: expiresInMinutes,
      });
      setExpiresInMinutes(preferences.taskArtifactSignedUrlExpiresInMinutes);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState testId="artifact-sharing-preferences-loading" />;
  }

  return (
    <div className="mt-6 grid gap-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Artifact Sharing</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Set the default lifetime for new signed task artifact download links.
        </p>
      </div>
      {error ? (
        <ErrorState description={error} title="Could not save sharing preferences." />
      ) : null}
      <label className="grid gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-text-primary">
        <span className="font-medium">Default signed URL expiry (minutes)</span>
        <input
          className="cc-input"
          disabled={saving}
          max={10080}
          min={0}
          onChange={(event) => setExpiresInMinutes(Number(event.target.value))}
          type="number"
          value={expiresInMinutes}
        />
        <span className="text-text-secondary">
          Use 0 for links that do not expire. Maximum: 10080 minutes.
        </span>
      </label>
      <div className="flex justify-end">
        <button
          className="cc-button"
          disabled={saving}
          onClick={() => void savePreferences()}
          type="button"
        >
          {saving ? "Saving..." : "Save sharing settings"}
        </button>
      </div>
    </div>
  );
}

function SecretsTab(props: { onShowSystemTab: () => void }) {
  const secretsQuery = useSecretsQuery();
  const mutations = useSecretMutations();
  const markEngineRestarting = useMarkEngineRestarting();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredSecrets = (secretsQuery.data ?? []).filter((secret) =>
    secret.key.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const error = secretsQuery.error instanceof Error ? secretsQuery.error.message : undefined;

  return (
    <div className="mt-6 grid gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Secrets</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Add secrets manually here, or let MCP references created with{" "}
            <code>{"{env:VAR_NAME}"}</code>
            appear automatically.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <button
            className="cc-button cc-button-secondary shrink-0 whitespace-nowrap"
            onClick={() => setCreating((current) => !current)}
            type="button"
          >
            {creating ? "Cancel" : "Add secret"}
          </button>
          <input
            aria-label="Search secrets"
            className="cc-input w-full md:min-w-80"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search secrets"
            value={search}
          />
        </div>
      </div>

      {creating ? (
        <SecretCreateForm
          busy={mutations.set.isPending || mutations.remove.isPending}
          existingKeys={(secretsQuery.data ?? []).map((secret) => secret.key)}
          onCancel={() => setCreating(false)}
          onShowSystemTab={props.onShowSystemTab}
          onSave={async (key, value, restart) => {
            await mutations.set.mutateAsync({ key, value, restart });
            if (restart) {
              markEngineRestarting();
            }
            setCreating(false);
          }}
        />
      ) : null}

      {error ? <ErrorState description={error} title="Secrets could not be loaded." /> : null}
      {secretsQuery.isLoading ? <LoadingState testId="secrets-loading" /> : null}

      {!secretsQuery.isLoading && !error && filteredSecrets.length === 0 ? (
        <EmptyState
          description={
            search.trim()
              ? "No secrets match the current search."
              : "No secrets exist yet. Add one manually or create an MCP variable reference."
          }
          title={search.trim() ? "No matching secrets" : "No secrets yet"}
        />
      ) : null}

      {!secretsQuery.isLoading && !error && filteredSecrets.length > 0 ? (
        <div className="grid gap-4">
          {filteredSecrets.map((secret) => (
            <SecretCard
              busy={mutations.set.isPending || mutations.remove.isPending}
              isSet={secret.isSet}
              key={secret.key}
              name={secret.key}
              stale={secret.stale}
              onShowSystemTab={props.onShowSystemTab}
              onDelete={async (restart) => {
                await mutations.remove.mutateAsync({ key: secret.key, restart });
                if (restart) {
                  markEngineRestarting();
                }
              }}
              onSave={async (value, restart) => {
                await mutations.set.mutateAsync({ key: secret.key, value, restart });
                if (restart && value.trim().length > 0) {
                  markEngineRestarting();
                }
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SecretCreateForm(props: {
  busy: boolean;
  existingKeys: string[];
  onSave: (key: string, value: string, restart: boolean) => Promise<void>;
  onCancel: () => void;
  onShowSystemTab: () => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);

  const normalizedKey = key.trim();
  const normalizedValue = value.trim();
  const duplicateKey = props.existingKeys.includes(normalizedKey);

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <label className="grid gap-2 text-sm text-text-primary">
          <span>Secret key</span>
          <input
            aria-label="Secret key"
            className="cc-input font-mono"
            onChange={(event) => setKey(event.target.value)}
            placeholder="GITHUB_TOKEN"
            value={key}
          />
          <span className="text-xs text-text-secondary">
            Environment variable name exposed to agents.
          </span>
        </label>
        <label className="grid gap-2 text-sm text-text-primary">
          <span>Secret value</span>
          <PasswordInput
            aria-label="Secret value"
            onChange={(event) => setValue(event.target.value)}
            placeholder="Enter a value"
            value={value}
          />
          <span className="text-xs text-text-secondary">
            Stored encrypted in this workspace and never shown back to agents.
          </span>
        </label>
      </div>

      {duplicateKey ? (
        <p className="mt-3 text-sm text-amber-500">Secret already exists. Update it below.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
          Cancel
        </button>
        <button
          className="cc-button"
          disabled={
            props.busy || normalizedKey.length === 0 || normalizedValue.length === 0 || duplicateKey
          }
          onClick={() => {
            setError(undefined);
            if (duplicateKey) {
              setError("Secret already exists. Update it below.");
              return;
            }
            setConfirming(true);
          }}
          type="button"
        >
          {props.busy ? "Saving..." : "Save secret"}
        </button>
      </div>

      {confirming ? (
        <ConfirmDialog
          confirmLabel="Restart now"
          description={
            <SecretRestartNotice
              onShowSystemTab={() => {
                setConfirming(false);
                props.onShowSystemTab();
              }}
            />
          }
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void handleSave(true);
          }}
          onSecondary={() => {
            setConfirming(false);
            void handleSave(false);
          }}
          secondaryLabel="I'll restart later"
          title={`Add ${normalizedKey}?`}
        />
      ) : null}
    </article>
  );

  async function handleSave(restart: boolean) {
    setError(undefined);

    if (duplicateKey) {
      setError("Secret already exists. Update it below.");
      return;
    }

    try {
      await props.onSave(normalizedKey, value, restart);
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function SecretCard(props: {
  name: string;
  isSet: boolean;
  stale: boolean;
  busy: boolean;
  onSave: (value: string, restart: boolean) => Promise<void>;
  onDelete: (restart: boolean) => Promise<void>;
  onShowSystemTab: () => void;
}) {
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<"update" | "delete">();

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-2 text-sm text-text-primary">
          <span>Name</span>
          <input className="cc-input font-mono" readOnly value={props.name} />
        </label>
        <label className="grid gap-2 text-sm text-text-primary">
          <span>Value</span>
          <div className="relative">
            <input
              aria-label={`Value for ${props.name}`}
              className="cc-input pr-12"
              onChange={(event) => setValue(event.target.value)}
              placeholder={
                props.stale
                  ? "Enter a new value to replace the stale secret"
                  : props.isSet
                    ? "Enter a new value to replace the current secret"
                    : "Enter a value"
              }
              type={revealed ? "text" : "password"}
              value={value}
            />
            <button
              aria-label={revealed ? `Hide ${props.name}` : `Show ${props.name}`}
              className="absolute inset-y-0 right-3 my-auto text-sm text-text-secondary transition hover:text-text-primary"
              onClick={() => setRevealed((current) => !current)}
              type="button"
            >
              {revealed ? "Hide" : "Show"}
            </button>
          </div>
        </label>
      </div>

      {props.stale ? (
        <p className="mt-3 text-sm text-amber-500">
          This secret was encrypted with an older key and is unavailable until you save a new value.
        </p>
      ) : null}
      {!props.stale && !props.isSet ? (
        <p className="mt-3 text-sm text-amber-500">
          This secret is referenced but does not have a value yet.
        </p>
      ) : null}
      {message ? <p className="mt-3 text-sm text-emerald-500">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          className="cc-button cc-button-secondary"
          disabled={props.busy || value.trim().length === 0}
          onClick={() => setPendingAction("update")}
          type="button"
        >
          {props.busy ? "Updating..." : "Update"}
        </button>
        <button
          className="cc-button cc-button-danger"
          disabled={props.busy}
          onClick={() => setPendingAction("delete")}
          type="button"
        >
          Delete
        </button>
      </div>

      {pendingAction ? (
        <ConfirmDialog
          confirmLabel="Restart now"
          confirmVariant={pendingAction === "delete" ? "danger" : "primary"}
          description={
            <SecretRestartNotice
              onShowSystemTab={() => {
                setPendingAction(undefined);
                props.onShowSystemTab();
              }}
            />
          }
          onCancel={() => setPendingAction(undefined)}
          onConfirm={() => {
            const action = pendingAction;
            setPendingAction(undefined);
            void (action === "delete" ? handleDelete(true) : handleSave(true));
          }}
          onSecondary={() => {
            const action = pendingAction;
            setPendingAction(undefined);
            void (action === "delete" ? handleDelete(false) : handleSave(false));
          }}
          secondaryLabel="I'll restart later"
          title={pendingAction === "delete" ? `Delete ${props.name}?` : `Update ${props.name}?`}
        />
      ) : null}
    </article>
  );

  async function handleSave(restart: boolean) {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onSave(value, restart);
      setValue("");
      setMessage(
        restart
          ? "Secret updated. Engine is restarting…"
          : "Secret updated. Restart the engine from the System tab to apply it.",
      );
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  async function handleDelete(restart: boolean) {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onDelete(restart);
      setMessage(
        restart
          ? "Secret deleted. Engine is restarting…"
          : "Secret deleted. Restart the engine from the System tab to apply it.",
      );
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
