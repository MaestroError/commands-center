import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, Clipboard, KeyRound, Pencil, Plus, ScrollText, ShieldCheck, X } from "lucide-react";

import {
  API_TOKEN_CAPABILITIES,
  API_TOKEN_CAPABILITY_GROUPS,
  API_TOKEN_PRESETS,
  type ApiTokenActivityEntry,
  type ApiTokenCapabilityGroup,
  type ApiTokenPermissions,
  type ApiTokenRecord,
  type CreateApiTokenResponse,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
import { GlobalDocumentAccessTree } from "@/components/api/GlobalDocumentAccessTree";
import { Checkbox } from "@/components/ui/checkbox";
import { EndpointsTab } from "@/components/api/EndpointsTab";
import { getTokenActivity, getTokenAuditSettings, updateTokenAuditSettings } from "@/lib/api";
import { useApiTokenMutations, useApiTokensQuery } from "@/hooks/use-api-tokens-query";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useTaskTemplatesQuery } from "@/hooks/use-tasks-query";
import { formatRepeatSummary, readAgentName } from "@/components/tasks/task-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TemplateOption = { id: string; title: string; specialistName: string; cadence: string };
type SpecialistOption = { id: string; name: string; slug: string };

const GROUP_LABELS: Record<ApiTokenCapabilityGroup, string> = {
  templates: "Task Templates",
  tasks: "Tasks",
  documents: "Documents",
};

function hasDocumentCapability(capabilities: Set<string>): boolean {
  return API_TOKEN_CAPABILITIES.some(
    (capability) => capability.group === "documents" && capabilities.has(capability.id),
  );
}

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
  const templatesQuery = useTaskTemplatesQuery();
  const specialistsQuery = useSpecialistsQuery();
  const mutations = useApiTokenMutations();
  const specialists = specialistsQuery.data ?? [];
  const templateOptions: TemplateOption[] = (templatesQuery.data ?? [])
    .filter((template) => template.mcpConfig.syncEnabled || template.mcpConfig.asyncEnabled)
    .map((template) => ({
      id: template.id,
      title: template.title,
      specialistName: readAgentName(specialists, template.defaultAgentId),
      cadence: template.recurrence ? formatRepeatSummary(template.recurrence.repeatRule) : "Manual",
    }));
  const specialistOptions: SpecialistOption[] = specialists.map((specialist) => ({
    id: specialist.id,
    name: specialist.name,
    slug: specialist.slug,
  }));
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [revealedToken, setRevealedToken] = useState<CreateApiTokenResponse>();
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenRecord>();
  const [activityTarget, setActivityTarget] = useState<ApiTokenRecord>();
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
        <Button
          variant="secondary"
          className="inline-flex items-center gap-2"
          onClick={() =>
            setForm((current) =>
              current.mode === "create" ? { mode: "closed" } : { mode: "create" },
            )
          }
          type="button"
        >
          {form.mode === "create" ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {form.mode === "create" ? "Cancel" : "Create token"}
        </Button>
      </div>

      {form.mode === "create" ? (
        <TokenForm
          busy={mutations.create.isPending}
          submitLabel="Create token"
          specialistOptions={specialistOptions}
          templateOptions={templateOptions}
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
          specialistOptions={specialistOptions}
          templateOptions={templateOptions}
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
              onViewActivity={() => setActivityTarget(token)}
            />
          ))}
        </div>
      ) : null}

      <RetentionControl />

      {activityTarget ? (
        <TokenActivityDialog token={activityTarget} onClose={() => setActivityTarget(undefined)} />
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
  specialistOptions: SpecialistOption[];
  templateOptions: TemplateOption[];
  title: string;
  onSubmit: (input: { name: string; permissions: ApiTokenPermissions }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(props.initialName ?? "");
  const [capabilities, setCapabilities] = useState<Set<string>>(
    () => new Set(props.initialPermissions?.capabilities ?? []),
  );
  const [templates, setTemplates] = useState<Set<string>>(
    () => new Set(props.initialPermissions?.templates ?? []),
  );
  const [globalDocuments, setGlobalDocuments] = useState(
    props.initialPermissions?.documents.global ?? false,
  );
  const [globalDocumentFolderPaths, setGlobalDocumentFolderPaths] = useState<Set<string>>(
    () => new Set(props.initialPermissions?.documents.globalFolderPaths ?? []),
  );
  const [privateSpecialistIds, setPrivateSpecialistIds] = useState<Set<string>>(
    () => new Set(props.initialPermissions?.documents.privateSpecialistIds ?? []),
  );
  const [error, setError] = useState<string>();
  const trimmedName = name.trim();
  const documentCapabilitySelected = hasDocumentCapability(capabilities);
  const documentRootSelected =
    globalDocuments || globalDocumentFolderPaths.size > 0 || privateSpecialistIds.size > 0;
  const canSubmit =
    trimmedName.length > 0 &&
    capabilities.size + templates.size > 0 &&
    (!documentCapabilitySelected || documentRootSelected) &&
    !props.busy;

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
        permissions: {
          capabilities: [...capabilities],
          templates: [...templates],
          documents: documentCapabilitySelected
            ? {
                global: globalDocuments,
                globalFolderPaths: globalDocuments ? [] : [...globalDocumentFolderPaths].sort(),
                privateSpecialistIds: [...privateSpecialistIds],
              }
            : { global: false, globalFolderPaths: [], privateSpecialistIds: [] },
        },
      });
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  function toggleTemplate(id: string, on: boolean) {
    setTemplates((current) => {
      const next = new Set(current);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
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
          <Input
            autoComplete="off"
            data-testid="token-name-input"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            placeholder="Release automation"
            value={name}
          />
        </label>
        <PermissionSelector
          value={capabilities}
          onChange={(next) => {
            setCapabilities(next);
            if (!hasDocumentCapability(next)) {
              setGlobalDocuments(false);
              setGlobalDocumentFolderPaths(new Set());
              setPrivateSpecialistIds(new Set());
            }
          }}
        />
      </div>

      {documentCapabilitySelected ? (
        <fieldset
          className="mt-4 grid gap-2 rounded-lg border border-border bg-app-bg p-3 text-sm"
          data-testid="token-documents-section"
        >
          <legend className="px-1 font-medium text-text-primary">Document access</legend>
          <p className="text-xs text-text-secondary">
            Select document roots or global folders this token may access. Folder access includes
            all documents and subfolders; unselected folders are hidden.
          </p>
          <GlobalDocumentAccessTree
            fullAccess={globalDocuments}
            selectedFolderPaths={globalDocumentFolderPaths}
            onFullAccessChange={(next) => {
              setGlobalDocuments(next);
              if (next) setGlobalDocumentFolderPaths(new Set());
            }}
            onSelectedFolderPathsChange={setGlobalDocumentFolderPaths}
          />
          {props.specialistOptions.length > 0 ? (
            <div className="grid gap-2 border-t border-border pt-2">
              <span className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Private Documents
              </span>
              {props.specialistOptions.map((specialist) => (
                <label
                  className="flex cursor-pointer items-center gap-3 text-text-secondary"
                  key={specialist.id}
                >
                  <input
                    checked={privateSpecialistIds.has(specialist.id)}
                    data-testid={`token-documents-specialist-${specialist.id}`}
                    onChange={(event) => {
                      setPrivateSpecialistIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(specialist.id);
                        else next.delete(specialist.id);
                        return next;
                      });
                    }}
                    type="checkbox"
                  />
                  <span className="text-text-primary">{specialist.name}</span>
                  <code className="text-xs text-text-muted">{specialist.slug}</code>
                </label>
              ))}
            </div>
          ) : null}
          {!documentRootSelected ? (
            <p className="text-xs text-danger">Select at least one document root.</p>
          ) : null}
        </fieldset>
      ) : null}

      {props.templateOptions.length > 0 ? (
        <fieldset
          className="mt-4 grid gap-2 rounded-lg border border-border bg-app-bg p-3 text-sm"
          data-testid="token-templates-section"
        >
          <legend className="px-1 font-medium text-text-primary">Template tools</legend>
          <p className="text-xs text-text-secondary">
            Choose which task templates this token may run as MCP tools.
          </p>
          {props.templateOptions.map((template) => (
            <label
              className="flex cursor-pointer items-center gap-3 text-text-secondary"
              key={template.id}
            >
              <input
                checked={templates.has(template.id)}
                data-testid={`token-template-${template.id}`}
                onChange={(event) => toggleTemplate(template.id, event.target.checked)}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="block text-text-primary">{template.title}</span>
                <span className="block truncate text-xs text-text-muted">
                  {template.specialistName} · {template.cadence}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={props.onCancel} type="button">
          Cancel
        </Button>
        <Button data-testid="token-submit" disabled={!canSubmit} type="submit">
          {props.busy ? "Saving..." : props.submitLabel}
        </Button>
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
              <Checkbox
                checked={someOn ? "indeterminate" : allOn}
                onCheckedChange={(checked) => togglePreset(group, checked === true)}
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
        <Button
          variant="secondary"
          className="inline-flex items-center gap-2"
          disabled={!clipboardAvailable}
          onClick={() => void copyToken()}
          title={clipboardAvailable ? "Copy token" : "Clipboard is unavailable"}
          type="button"
        >
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={props.onDismiss} type="button">
          Done
        </Button>
      </div>
    </section>
  );
}

function TokenCard(props: {
  token: ApiTokenRecord;
  busy: boolean;
  onEdit: () => void;
  onRevoke: () => void;
  onViewActivity: () => void;
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
        <div className="flex gap-2 justify-self-start lg:justify-self-end">
          <Button
            variant="secondary"
            className="inline-flex items-center gap-2"
            onClick={props.onViewActivity}
            type="button"
          >
            <ScrollText className="h-4 w-4" />
            Activity
          </Button>
          {!revoked ? (
            <>
              <Button
                variant="secondary"
                className="inline-flex items-center gap-2"
                disabled={props.busy}
                onClick={props.onEdit}
                type="button"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="danger" disabled={props.busy} onClick={props.onRevoke} type="button">
                Revoke
              </Button>
            </>
          ) : null}
        </div>
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
          <Button
            variant="danger"
            disabled={props.busy}
            onClick={() => void confirm()}
            type="button"
          >
            {props.busy ? "Revoking..." : "Confirm revoke"}
          </Button>
          <Button variant="secondary" onClick={props.onClose} type="button">
            Cancel
          </Button>
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
  const templateCount = permissions.templates.length;
  const templateBadges =
    templateCount > 0
      ? [`${templateCount} template ${templateCount === 1 ? "tool" : "tools"}`]
      : [];
  const documentBadges = [
    ...(permissions.documents.global ? ["Global documents"] : []),
    ...(permissions.documents.globalFolderPaths.length > 0
      ? [
          `${permissions.documents.globalFolderPaths.length} global document ${permissions.documents.globalFolderPaths.length === 1 ? "folder" : "folders"}`,
        ]
      : []),
    ...(permissions.documents.privateSpecialistIds.length > 0
      ? [
          `${permissions.documents.privateSpecialistIds.length} private document ${permissions.documents.privateSpecialistIds.length === 1 ? "root" : "roots"}`,
        ]
      : []),
  ];

  if (enabled.size === 0) {
    return [...templateBadges, ...documentBadges];
  }

  const fullyOnGroups = API_TOKEN_CAPABILITY_GROUPS.filter((group) =>
    API_TOKEN_PRESETS[group].every((id) => enabled.has(id)),
  );

  const covered = new Set(fullyOnGroups.flatMap((group) => API_TOKEN_PRESETS[group]));
  const everyEnabledCovered = [...enabled].every((id) => covered.has(id));

  if (fullyOnGroups.length > 0 && everyEnabledCovered) {
    return [
      ...fullyOnGroups.map((group) => GROUP_LABELS[group]),
      ...templateBadges,
      ...documentBadges,
    ];
  }

  return [
    `${enabled.size} ${enabled.size === 1 ? "permission" : "permissions"}`,
    ...templateBadges,
    ...documentBadges,
  ];
}

function RetentionControl() {
  const [weeks, setWeeks] = useState(4);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getTokenAuditSettings()
      .then((settings) => {
        if (!cancelled) {
          setWeeks(settings.retentionWeeks);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return null;
  }

  const invalid = !Number.isInteger(weeks) || weeks < 1 || weeks > 20;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <label className="grid gap-1 text-sm text-text-primary">
        <span className="font-medium">Activity retention (weeks)</span>
        <Input
          className="w-32"
          data-testid="token-retention-input"
          disabled={saving}
          max={20}
          min={1}
          onChange={(event) => setWeeks(Number(event.target.value))}
          type="number"
          value={weeks}
        />
      </label>
      <span className="mb-2 text-xs text-text-secondary">
        Per-token request history is pruned after this window (1–20 weeks).
      </span>
      <Button
        variant="secondary"
        className="mb-1 ml-auto"
        disabled={saving || invalid}
        onClick={() => {
          setSaving(true);
          void updateTokenAuditSettings({ retentionWeeks: weeks })
            .then((settings) => setWeeks(settings.retentionWeeks))
            .finally(() => setSaving(false));
        }}
        type="button"
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

function TokenActivityDialog(props: { token: ApiTokenRecord; onClose: () => void }) {
  const [entries, setEntries] = useState<ApiTokenActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  function load(nextCursor?: string): void {
    setLoading(true);
    setError(undefined);
    void getTokenActivity(props.token.id, { limit: 25, cursor: nextCursor })
      .then((page) => {
        setEntries((current) => (nextCursor ? [...current, ...page.entries] : page.entries));
        setCursor(page.nextCursor);
      })
      .catch((nextError: unknown) =>
        setError(nextError instanceof Error ? nextError.message : "Failed to load activity."),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.token.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
      onClick={props.onClose}
    >
      <section
        className="cc-panel flex max-h-[85vh] w-full max-w-3xl flex-col p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-primary">Activity — {props.token.name}</h2>
          <Button variant="secondary" onClick={props.onClose} type="button">
            Close
          </Button>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Requests made with this token (most recent first).
        </p>

        {error ? <ErrorState description={error} title="Could not load activity." /> : null}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 && !loading ? (
            <EmptyState
              description="This token has not made any requests yet."
              title="No activity"
            />
          ) : (
            <ul className="grid gap-2" data-testid="token-activity-list">
              {entries.map((entry) => (
                <li
                  className="rounded-lg border border-border bg-app-bg p-3 text-sm"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        entry.outcome === "error"
                          ? "border-danger/30 bg-danger/10 text-danger"
                          : "border-success/30 bg-success/10 text-success",
                      ].join(" ")}
                    >
                      {entry.outcome}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                      {entry.surface}
                    </span>
                    <code className="font-mono text-text-primary">{entry.action}</code>
                    {entry.statusCode !== null ? (
                      <span className="text-xs text-text-muted">{entry.statusCode}</span>
                    ) : null}
                    <span className="ml-auto text-xs text-text-muted">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                  {entry.targetId ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      {entry.targetKind}: <code className="font-mono">{entry.targetId}</code>
                    </p>
                  ) : null}
                  {entry.inputSummary !== undefined ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface p-2 text-xs leading-5 text-text-secondary">
                      {JSON.stringify(entry.inputSummary, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {loading ? <LoadingState testId="token-activity-loading" /> : null}
        </div>

        {cursor ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => load(cursor)}
              type="button"
            >
              Load more
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
