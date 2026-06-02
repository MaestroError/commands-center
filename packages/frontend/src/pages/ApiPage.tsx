import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Clipboard, KeyRound, Plus, ShieldCheck, X } from "lucide-react";

import type { ApiTokenRecord, ApiTokenScope, CreateApiTokenResponse } from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { useApiTokenMutations, useApiTokensQuery } from "@/hooks/use-api-tokens-query";

const SCOPE_OPTIONS = [
  {
    scope: "templates",
    label: "Task Templates",
    description: "Trigger templates and poll template-originated runs.",
  },
  {
    scope: "tasks",
    label: "Tasks",
    description: "Create, trigger, schedule, and inspect workspace tasks.",
  },
] satisfies Array<{ scope: ApiTokenScope; label: string; description: string }>;

export function ApiPage() {
  const [activeTabId, setActiveTabId] = useState("tokens");
  const tabs = useMemo(() => [{ id: "tokens", label: "Tokens" }], []);

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Manage API tokens for programmatic access to the CommandsCenter public API."
        eyebrow="API"
        title="API"
      />
      <section className="cc-panel p-6">
        <TabBar activeTabId={activeTabId} onTabChange={setActiveTabId} tabs={tabs} />
        {activeTabId === "tokens" ? <TokensTab /> : null}
      </section>
    </div>
  );
}

function TokensTab() {
  const tokensQuery = useApiTokensQuery();
  const mutations = useApiTokenMutations();
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<CreateApiTokenResponse>();
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRecord>();
  const tokens = tokensQuery.data?.tokens ?? [];
  const error = tokensQuery.error instanceof Error ? tokensQuery.error.message : undefined;
  const mutationError =
    mutations.create.error instanceof Error
      ? mutations.create.error.message
      : mutations.revoke.error instanceof Error
        ? mutations.revoke.error.message
        : undefined;

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">API Tokens</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Issue scoped bearer tokens for external integrations and agent-to-agent workflows.
          </p>
        </div>
        <button
          className="cc-button cc-button-secondary inline-flex items-center gap-2"
          onClick={() => setCreating((current) => !current)}
          type="button"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? "Cancel" : "Create token"}
        </button>
      </div>

      {creating ? (
        <TokenCreateForm
          busy={mutations.create.isPending}
          onCancel={() => setCreating(false)}
          onCreate={async (input) => {
            const result = await mutations.create.mutateAsync(input);
            setRevealedToken(result);
            setCreating(false);
          }}
        />
      ) : null}

      {revealedToken ? (
        <TokenRevealPanel reveal={revealedToken} onDismiss={() => setRevealedToken(undefined)} />
      ) : null}

      {error ? <ErrorState description={error} title="API tokens could not be loaded." /> : null}
      {mutationError ? (
        <ErrorState description={mutationError} title="Token request failed." />
      ) : null}
      {tokensQuery.isLoading ? <LoadingState testId="api-tokens-loading" /> : null}

      {!tokensQuery.isLoading && !error && tokens.length === 0 ? (
        <EmptyState
          description="No API tokens exist yet. Create a scoped token before connecting external systems."
          title="No API tokens yet"
        />
      ) : null}

      {!tokensQuery.isLoading && !error && tokens.length > 0 ? (
        <div className="grid gap-4">
          {tokens.map((token) => (
            <TokenCard
              busy={mutations.revoke.isPending}
              key={token.id}
              token={token}
              onRevoke={() => setRevokeTarget(token)}
            />
          ))}
        </div>
      ) : null}

      {revokeTarget ? (
        <RevokeTokenDialog
          busy={mutations.revoke.isPending}
          token={revokeTarget}
          onClose={() => setRevokeTarget(undefined)}
          onConfirm={async () => {
            await mutations.revoke.mutateAsync(revokeTarget.id);
            setRevokeTarget(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

function TokenCreateForm(props: {
  busy: boolean;
  onCreate: (input: { name: string; scopes: ApiTokenScope[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [error, setError] = useState<string>();
  const trimmedName = name.trim();
  const boardSelected = hasScope(scopes, "templates") && hasScope(scopes, "tasks");
  const canSubmit = trimmedName.length > 0 && scopes.length > 0 && !props.busy;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);

    if (!canSubmit) {
      setError("Enter a name and select at least one permission.");
      return;
    }

    try {
      await props.onCreate({ name: trimmedName, scopes });
      setName("");
      setScopes([]);
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  return (
    <form
      className="rounded-xl border border-border bg-surface p-5"
      onSubmit={(event) => void onSubmit(event)}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="grid gap-2 text-sm font-medium text-text-primary">
          Token name
          <input
            autoComplete="off"
            className="cc-input"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Release automation"
            value={name}
          />
        </label>
        <div className="grid gap-3 text-sm text-text-primary">
          <span className="font-medium">Permissions</span>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-app-bg p-3">
            <input
              checked={boardSelected}
              className="mt-1"
              onChange={(event) => setScopes(event.target.checked ? ["templates", "tasks"] : [])}
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Board</span>
              <span className="mt-1 block text-xs leading-5 text-text-secondary">
                Convenience option that enables both task template and task permissions.
              </span>
            </span>
          </label>
          {SCOPE_OPTIONS.map((option) => (
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-app-bg p-3"
              key={option.scope}
            >
              <input
                checked={hasScope(scopes, option.scope)}
                className="mt-1"
                onChange={(event) =>
                  setScopes((current) =>
                    event.target.checked
                      ? addScope(current, option.scope)
                      : current.filter((scope) => scope !== option.scope),
                  )
                }
                type="checkbox"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-text-secondary">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
          Cancel
        </button>
        <button className="cc-button" disabled={!canSubmit} type="submit">
          {props.busy ? "Creating..." : "Create token"}
        </button>
      </div>
    </form>
  );
}

function TokenRevealPanel(props: { reveal: CreateApiTokenResponse; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);

  async function copyToken(): Promise<void> {
    if (!clipboardAvailable) {
      return;
    }

    await navigator.clipboard.writeText(props.reveal.token);
    setCopied(true);
  }

  return (
    <section className="rounded-xl border border-success/40 bg-success/10 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold text-text-primary">Copy this token now</h3>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            This token will not be shown again. Copy it now and store it somewhere safe.
          </p>
        </div>
        <ScopeBadges scopes={props.reveal.record.scopes} />
      </div>
      <code className="mt-4 block overflow-x-auto rounded-lg border border-border bg-app-bg p-3 text-sm text-text-primary">
        {props.reveal.token}
      </code>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          className="cc-button cc-button-secondary inline-flex items-center gap-2"
          disabled={!clipboardAvailable}
          onClick={() => void copyToken()}
          title={clipboardAvailable ? "Copy token" : "Clipboard is unavailable"}
          type="button"
        >
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="cc-button" onClick={props.onDismiss} type="button">
          Done
        </button>
      </div>
    </section>
  );
}

function TokenCard(props: { token: ApiTokenRecord; busy: boolean; onRevoke: () => void }) {
  const revoked = props.token.revokedAt !== null;

  return (
    <article
      className={[
        "rounded-xl border border-border bg-surface p-5",
        revoked ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <KeyRound className="h-4 w-4 text-text-secondary" />
            <h3 className="min-w-0 break-words font-semibold text-text-primary">
              {props.token.name}
            </h3>
            <StatusBadge revoked={revoked} />
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <TokenMetric
              label="Prefix"
              value={<code className="font-mono">{props.token.tokenPrefix}...</code>}
            />
            <TokenMetric label="Created" value={formatDate(props.token.createdAt)} />
            <TokenMetric
              label="Last used"
              value={props.token.lastUsedAt ? formatDate(props.token.lastUsedAt) : "Never"}
            />
            <TokenMetric label="Permissions" value={<ScopeBadges scopes={props.token.scopes} />} />
          </dl>
        </div>
        {!revoked ? (
          <button
            className="cc-button cc-button-danger justify-self-start lg:justify-self-end"
            disabled={props.busy}
            onClick={props.onRevoke}
            type="button"
          >
            Revoke
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TokenMetric(props: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.2em] text-text-muted">{props.label}</dt>
      <dd className="mt-1 text-text-primary">{props.value}</dd>
    </div>
  );
}

function ScopeBadges(props: { scopes: ApiTokenScope[] }) {
  const labels =
    hasScope(props.scopes, "templates") && hasScope(props.scopes, "tasks")
      ? ["Board"]
      : props.scopes.map((scope) => (scope === "templates" ? "Task Templates" : "Tasks"));

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-xs font-medium text-text-primary"
          key={label}
        >
          <ShieldCheck className="h-3 w-3" />
          {label}
        </span>
      ))}
    </div>
  );
}

function StatusBadge(props: { revoked: boolean }) {
  return (
    <span
      className={[
        "rounded-full border px-2 py-1 text-xs font-medium",
        props.revoked
          ? "border-border bg-surface-muted text-text-secondary"
          : "border-success/30 bg-success/10 text-success",
      ].join(" ")}
    >
      {props.revoked ? "Revoked" : "Active"}
    </span>
  );
}

function RevokeTokenDialog(props: {
  token: ApiTokenRecord;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();

  async function confirm(): Promise<void> {
    setError(undefined);

    try {
      await props.onConfirm();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
      onClick={props.onClose}
    >
      <section
        className="cc-panel w-full max-w-lg p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-text-primary">Revoke {props.token.name}?</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Integrations using this token will immediately lose access. The token record stays visible
          for audit history.
        </p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            className="cc-button cc-button-danger"
            disabled={props.busy}
            onClick={() => void confirm()}
            type="button"
          >
            {props.busy ? "Revoking..." : "Confirm revoke"}
          </button>
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function addScope(current: ApiTokenScope[], scope: ApiTokenScope): ApiTokenScope[] {
  return hasScope(current, scope) ? current : [...current, scope];
}

function hasScope(scopes: ApiTokenScope[], scope: ApiTokenScope): boolean {
  return scopes.includes(scope);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
