import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, Clipboard, KeyRound, Pencil, Plus, ShieldCheck, X } from "lucide-react";

import {
  API_TOKEN_CAPABILITIES,
  API_TOKEN_CAPABILITY_GROUPS,
  API_TOKEN_PRESETS,
  type ApiTokenCapabilityGroup,
  type ApiTokenPermissions,
  type ApiTokenRecord,
  type CreateApiTokenResponse,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { EndpointsTab } from "@/components/api/EndpointsTab";
import { useApiTokenMutations, useApiTokensQuery } from "@/hooks/use-api-tokens-query";

const GROUP_LABELS: Record<ApiTokenCapabilityGroup, string> = {
  templates: "Task Templates",
  tasks: "Tasks",
};

export function ApiPage() {
  const [activeTabId, setActiveTabId] = useState("tokens");
  const tabs = useMemo(
    () => [
      { id: "tokens", label: "Tokens" },
      { id: "endpoints", label: "Endpoints" },
    ],
    [],
  );

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
        {activeTabId === "endpoints" ? (
          <EndpointsTab onGoToTokens={() => setActiveTabId("tokens")} />
        ) : null}
      </section>
    </div>
  );
}

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; token: ApiTokenRecord };

function TokensTab() {
  const tokensQuery = useApiTokensQuery();
  const mutations = useApiTokenMutations();
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [revealedToken, setRevealedToken] = useState<CreateApiTokenResponse>();
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRecord>();
  const tokens = tokensQuery.data?.tokens ?? [];
  const activeTokens = tokens.filter((token) => token.revokedAt === null);
  const error = tokensQuery.error instanceof Error ? tokensQuery.error.message : undefined;
  const mutationError =
    mutations.create.error instanceof Error
      ? mutations.create.error.message
      : mutations.update.error instanceof Error
        ? mutations.update.error.message
        : mutations.revoke.error instanceof Error
          ? mutations.revoke.error.message
          : undefined;

  return (
    <div className="mt-6 grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">API Tokens</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Issue scoped bearer tokens for external integrations and agent-to-agent workflows. Pick
            exactly the permissions each token needs.
          </p>
        </div>
        <button
          className="cc-button cc-button-secondary inline-flex items-center gap-2"
          onClick={() =>
            setForm((current) =>
              current.mode === "create" ? { mode: "closed" } : { mode: "create" },
            )
          }
          type="button"
        >
          {form.mode === "create" ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {form.mode === "create" ? "Cancel" : "Create token"}
        </button>
      </div>

      {form.mode === "create" ? (
        <TokenForm
          busy={mutations.create.isPending}
          submitLabel="Create token"
          title="New token"
          onCancel={() => setForm({ mode: "closed" })}
          onSubmit={async (input) => {
            const result = await mutations.create.mutateAsync(input);
            setRevealedToken(result);
            setForm({ mode: "closed" });
          }}
        />
      ) : null}

      {form.mode === "edit" ? (
        <TokenForm
          busy={mutations.update.isPending}
          initialName={form.token.name}
          initialPermissions={form.token.permissions}
          submitLabel="Save changes"
          title={`Edit ${form.token.name}`}
          onCancel={() => setForm({ mode: "closed" })}
          onSubmit={async (input) => {
            await mutations.update.mutateAsync({ id: form.token.id, ...input });
            setForm({ mode: "closed" });
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
              onEdit={() => setForm({ mode: "edit", token })}
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

      <p className="sr-only" data-testid="active-token-count">
        {activeTokens.length}
      </p>
    </div>
  );
}

function TokenForm(props: {
  busy: boolean;
  initialName?: string;
  initialPermissions?: ApiTokenPermissions;
  submitLabel: string;
  title: string;
  onSubmit: (input: { name: string; permissions: ApiTokenPermissions }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initialName ?? "");
  const [capabilities, setCapabilities] = useState<Set<string>>(
    () => new Set(props.initialPermissions?.capabilities ?? []),
  );
  // Templates are scaffolded on the token model but not yet editable here (Phase 3).
  const templates = props.initialPermissions?.templates ?? [];
  const [error, setError] = useState<string>();
  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length > 0 && capabilities.size + templates.length > 0 && !props.busy;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);

    if (!canSubmit) {
      setError("Enter a name and select at least one permission.");
      return;
    }

    try {
      await props.onSubmit({
        name: trimmedName,
        permissions: { capabilities: [...capabilities], templates },
      });
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  return (
    <form
      className="rounded-xl border border-border bg-surface p-5"
      onSubmit={(event) => void onSubmit(event)}
    >
      <h3 className="text-lg font-semibold text-text-primary">{props.title}</h3>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="grid h-fit gap-2 text-sm font-medium text-text-primary">
          Token name
          <input
            autoComplete="off"
            className="cc-input"
            data-testid="token-name-input"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Release automation"
            value={name}
          />
        </label>
        <PermissionSelector value={capabilities} onChange={setCapabilities} />
      </div>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button className="cc-button cc-button-secondary" onClick={props.onCancel} type="button">
          Cancel
        </button>
        <button
          className="cc-button"
          data-testid="token-submit"
          disabled={!canSubmit}
          type="submit"
        >
          {props.busy ? "Saving..." : props.submitLabel}
        </button>
      </div>
    </form>
  );
}

function PermissionSelector(props: { value: Set<string>; onChange: (next: Set<string>) => void }) {
  const allCapabilityIds = useMemo(
    () => API_TOKEN_CAPABILITIES.map((capability) => capability.id),
    [],
  );
  const allSelected = allCapabilityIds.every((id) => props.value.has(id));

  function toggleCapability(id: string, on: boolean) {
    const next = new Set(props.value);
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
    props.onChange(next);
  }

  function togglePreset(group: ApiTokenCapabilityGroup, on: boolean) {
    const next = new Set(props.value);
    for (const id of API_TOKEN_PRESETS[group]) {
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    props.onChange(next);
  }

  function toggleAll(on: boolean) {
    props.onChange(on ? new Set(allCapabilityIds) : new Set());
  }

  return (
    <div className="grid gap-3 text-sm text-text-primary">
      <div className="flex items-center justify-between">
        <span className="font-medium">Permissions</span>
        <button
          className="text-xs text-accent underline-offset-2 hover:underline"
          onClick={() => toggleAll(!allSelected)}
          type="button"
        >
          {allSelected ? "Select none" : "Select all"}
        </button>
      </div>

      {API_TOKEN_CAPABILITY_GROUPS.map((group) => {
        const presetIds = API_TOKEN_PRESETS[group];
        const enabledInPreset = presetIds.filter((id) => props.value.has(id)).length;
        const allOn = enabledInPreset === presetIds.length;
        const someOn = enabledInPreset > 0 && !allOn;
        const groupCapabilities = API_TOKEN_CAPABILITIES.filter(
          (capability) => capability.group === group,
        );

        return (
          <fieldset
            className="rounded-lg border border-border bg-app-bg p-3"
            data-testid={`permission-group-${group}`}
            key={group}
          >
            <label className="flex cursor-pointer items-center gap-3 font-medium">
              <TriStateCheckbox
                checked={allOn}
                indeterminate={someOn}
                onChange={(event) => togglePreset(group, event.target.checked)}
              />
              {GROUP_LABELS[group]}
              <span className="text-xs font-normal text-text-secondary">
                {enabledInPreset}/{presetIds.length}
              </span>
            </label>

            <div className="mt-3 grid gap-2 pl-7">
              {groupCapabilities.map((capability) => (
                <label
                  className="flex cursor-pointer items-start gap-3 text-text-secondary"
                  key={capability.id}
                >
                  <input
                    checked={props.value.has(capability.id)}
                    className="mt-1"
                    data-testid={`permission-${capability.id}`}
                    onChange={(event) => toggleCapability(capability.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-medium text-text-primary">{capability.label}</span>
                    <span className="mt-0.5 block text-xs leading-5">{capability.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

function TriStateCheckbox(props: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = props.indeterminate && !props.checked;
    }
  }, [props.indeterminate, props.checked]);

  return <input checked={props.checked} onChange={props.onChange} ref={ref} type="checkbox" />;
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
        <PermissionBadges permissions={props.reveal.record.permissions} />
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

function TokenCard(props: {
  token: ApiTokenRecord;
  busy: boolean;
  onEdit: () => void;
  onRevoke: () => void;
}) {
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
            <TokenMetric
              label="Permissions"
              value={<PermissionBadges permissions={props.token.permissions} />}
            />
          </dl>
        </div>
        {!revoked ? (
          <div className="flex gap-2 justify-self-start lg:justify-self-end">
            <button
              className="cc-button cc-button-secondary inline-flex items-center gap-2"
              disabled={props.busy}
              onClick={props.onEdit}
              type="button"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              className="cc-button cc-button-danger"
              disabled={props.busy}
              onClick={props.onRevoke}
              type="button"
            >
              Revoke
            </button>
          </div>
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

function PermissionBadges(props: { permissions: ApiTokenPermissions }) {
  const labels = summarizePermissions(props.permissions);

  if (labels.length === 0) {
    return <span className="text-xs text-text-secondary">None</span>;
  }

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

// A group badge when its full preset id-list is enabled; otherwise a plain
// count. Falls back to the count when enabled capabilities aren't cleanly
// covered by fully-on presets.
function summarizePermissions(permissions: ApiTokenPermissions): string[] {
  const enabled = new Set(permissions.capabilities);

  if (enabled.size === 0) {
    return [];
  }

  const fullyOnGroups = API_TOKEN_CAPABILITY_GROUPS.filter((group) =>
    API_TOKEN_PRESETS[group].every((id) => enabled.has(id)),
  );

  const covered = new Set(fullyOnGroups.flatMap((group) => API_TOKEN_PRESETS[group]));
  const everyEnabledCovered = [...enabled].every((id) => covered.has(id));

  if (fullyOnGroups.length > 0 && everyEnabledCovered) {
    return fullyOnGroups.map((group) => GROUP_LABELS[group]);
  }

  return [`${enabled.size} ${enabled.size === 1 ? "permission" : "permissions"}`];
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
