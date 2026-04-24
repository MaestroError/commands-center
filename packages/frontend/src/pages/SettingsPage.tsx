import { useMemo, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";

export function SettingsPage() {
  const [activeTabId, setActiveTabId] = useState("secrets");
  const tabs = useMemo(
    () => [
      {
        id: "secrets",
        label: "Secrets",
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
        {activeTabId === "secrets" ? <SecretsTab /> : null}
      </section>
    </div>
  );
}

function SecretsTab() {
  const secretsQuery = useSecretsQuery();
  const mutations = useSecretMutations();
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
              onDelete={async () => mutations.remove.mutateAsync({ key: secret.key })}
              onSave={async (value) => mutations.set.mutateAsync({ key: secret.key, value })}
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
          onClick={() => void handleSave()}
          type="button"
        >
          {props.busy ? "Updating..." : "Update"}
        </button>
        <button
          className="cc-button cc-button-danger"
          disabled={props.busy}
          onClick={() => void handleDelete()}
          type="button"
        >
          Delete
        </button>
      </div>
    </article>
  );

  async function handleSave() {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onSave(value);
      setValue("");
      setMessage("Secret updated.");
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  async function handleDelete() {
    setMessage(undefined);
    setError(undefined);

    try {
      await props.onDelete();
      setMessage("Secret deleted.");
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
