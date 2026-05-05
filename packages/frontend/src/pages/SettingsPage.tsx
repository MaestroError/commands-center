import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { useMarkEngineRestarting } from "@/hooks/use-engine-status-query";
import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import {
  useSystemUpdateMutation,
  useSystemUpdatePreferencesMutation,
  useSystemUpdatePreferencesQuery,
  useSystemVersionQuery,
} from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import { getFileManagerPreferences, updateFileManagerPreferences } from "@/lib/api";

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
        {activeTabId === "secrets" ? <SecretsTab /> : null}
        {activeTabId === "file-manager" ? <FileManagerTab /> : null}
      </section>
    </div>
  );
}

function SystemTab() {
  const versionQuery = useSystemVersionQuery();
  const preferencesQuery = useSystemUpdatePreferencesQuery();
  const preferencesMutation = useSystemUpdatePreferencesMutation();
  const updateMutation = useSystemUpdateMutation();
  const activeRunsQuery = useActiveTaskRunsQuery();
  const version = versionQuery.data;
  const preferences = preferencesQuery.data;
  const activeRunCount = activeRunsQuery.data?.length ?? 0;
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
  const updateResult = updateMutation.data;

  return (
    <div className="mt-6 grid gap-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">System Updates</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Check the installed CommandsCenter version and apply safe updates for this installation.
        </p>
      </div>

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
                className="cc-button sm:w-auto"
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
    </div>
  );
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

function SecretsTab() {
  const secretsQuery = useSecretsQuery();
  const mutations = useSecretMutations();
  const markEngineRestarting = useMarkEngineRestarting();
  const [search, setSearch] = useState("");

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
            MCP references created with <code>{"{env:VAR_NAME}"}</code> appear here automatically.
          </p>
        </div>
        <input
          aria-label="Search secrets"
          className="cc-input w-full md:max-w-sm"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search secrets"
          value={search}
        />
      </div>

      {error ? <ErrorState description={error} title="Secrets could not be loaded." /> : null}
      {secretsQuery.isLoading ? <LoadingState testId="secrets-loading" /> : null}

      {!secretsQuery.isLoading && !error && filteredSecrets.length === 0 ? (
        <EmptyState
          description={
            search.trim()
              ? "No secrets match the current search."
              : "No secrets exist yet. Add an MCP variable reference to create one automatically."
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
              onDelete={async () => {
                await mutations.remove.mutateAsync({ key: secret.key });
                markEngineRestarting();
              }}
              onSave={async (value) => {
                await mutations.set.mutateAsync({ key: secret.key, value });
                if (value.trim().length > 0) {
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

function SecretCard(props: {
  name: string;
  isSet: boolean;
  busy: boolean;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
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
                props.isSet ? "Enter a new value to replace the current secret" : "Enter a value"
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

      {!props.isSet ? (
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
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
          onClick={() => setPendingAction(undefined)}
        >
          <section
            className="cc-panel w-full max-w-lg p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-text-primary">
              {pendingAction === "delete" ? `Delete ${props.name}?` : `Update ${props.name}?`}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              The AI engine will be restarted automatically so the updated environment is picked up.
              Any active agent sessions will be interrupted briefly.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                className={pendingAction === "delete" ? "cc-button cc-button-danger" : "cc-button"}
                onClick={() => {
                  setPendingAction(undefined);
                  void (pendingAction === "delete" ? handleDelete() : handleSave());
                }}
                type="button"
              >
                {pendingAction === "delete" ? "Confirm delete" : "Confirm update"}
              </button>
              <button
                className="cc-button cc-button-secondary"
                onClick={() => setPendingAction(undefined)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );

  async function handleSave() {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onSave(value);
      setValue("");
      setMessage("Secret updated. Engine is restarting…");
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  async function handleDelete() {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onDelete();
      setMessage("Secret deleted. Engine is restarting…");
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
