import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import { useSecretMutations, useSecretsQuery } from "@/hooks/use-secrets-query";
import { useSpecialistMutations, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useSystemVersionQuery } from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import { McpEngineRestartRequiredError } from "@/lib/api";
import type { McpServer } from "@cc/shared/schemas";
import { useState } from "react";
import { CcInstancesSection } from "./integrations/cc-instances-section";
import { ComposioSection } from "./integrations/composio-section";
import {
  CcInstanceDialog,
  ComposioDialog,
  McpAuthDialog,
} from "./integrations/integration-dialogs";
import {
  CC_INSTANCE_AUTH_HEADER,
  COMPOSIO_API_KEY_HEADER,
  COMPOSIO_SERVER_URL,
  CONFIGURED_SECTION_STORAGE_KEY,
  type DialogState,
  SEARCH_SUGGESTIONS,
  SUGGESTED_MCP_SERVERS,
  SUGGESTED_SECTION_STORAGE_KEY,
  SUGGESTED_SHOW_ALL_STORAGE_KEY,
  type SuggestedMcpServer,
  buildAssignmentMessage,
  buildCcInstanceAuthHeaderValue,
  buildDuplicateForm,
  buildSuggestedMcpForm,
  describeConfig,
  friendlyStatus,
  isCcInstanceServer,
  isComposioServer,
  readError,
  statusBadgeVariant,
  syncAgentAssignments,
  tagLabel,
  tagStyle,
  usePersistentBooleanState,
  useResponsiveSuggestionCount,
} from "./integrations/integration-helpers";
import { CloseIcon, OpenInNewIcon } from "./integrations/integration-icons";
import { SecretKeyPill, SectionToggleButton } from "./integrations/integration-parts";
import { McpServerDialog } from "./integrations/mcp-server-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function IntegrationsPage() {
  const agentsQuery = useSpecialistsQuery();
  const agentMutations = useSpecialistMutations();
  const mcpServersQuery = useMcpServersQuery();
  const mcpMutations = useMcpServerMutations();
  const secretsQuery = useSecretsQuery();
  const secretMutations = useSecretMutations();
  const activeRunsQuery = useActiveTaskRunsQuery();
  const systemVersionQuery = useSystemVersionQuery();
  const [dialog, setDialog] = useState<DialogState>();
  const [authServer, setAuthServer] = useState<McpServer>();
  const [composioDialogOpen, setComposioDialogOpen] = useState(false);
  const [ccInstanceDialogOpen, setCcInstanceDialogOpen] = useState(false);
  const [restartConsent, setRestartConsent] = useState<McpServer>();
  const [activationError, setActivationError] = useState<{ serverId: string; message: string }>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [configuredExpanded, setConfiguredExpanded] = usePersistentBooleanState(
    CONFIGURED_SECTION_STORAGE_KEY,
    true,
  );
  const queryError = mcpServersQuery.error ? readError(mcpServersQuery.error) : undefined;
  const mcpServers = mcpServersQuery.data ?? [];
  const composioServers = mcpServers.filter(isComposioServer);
  const ccInstanceServers = mcpServers.filter(isCcInstanceServer);
  const customMcpServers = mcpServers.filter(
    (server) => !isComposioServer(server) && !isCcInstanceServer(server),
  );
  const agents = agentsQuery.data ?? [];
  const secretMeta = secretsQuery.data ?? [];
  const secretKeys = secretMeta.map((secret) => secret.key);
  const unsetSecretKeys = new Set(
    secretMeta.filter((secret) => !secret.isSet).map((secret) => secret.key),
  );
  const activeRunCount =
    activeRunsQuery.data?.filter((run) => run.status === "running").length ?? 0;

  async function activateServer(server: McpServer, restartEngine: boolean): Promise<void> {
    setActivationError(undefined);

    try {
      await mcpMutations.activate.mutateAsync({ id: server.id, restartEngine });
      setSuccessMessage(`${server.name} activated.`);
    } catch (error) {
      if (!restartEngine && error instanceof McpEngineRestartRequiredError) {
        setRestartConsent(server);
        return;
      }

      setActivationError({ serverId: server.id, message: readError(error) });
    }
  }

  function requestActivation(server: McpServer): void {
    setSuccessMessage(undefined);
    setActivationError(undefined);

    if (server.requiresEngineRestart) {
      setRestartConsent(server);
      return;
    }

    void activateServer(server, false);
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={mcpMutations.refresh.isPending}
              onClick={() => mcpMutations.refresh.mutate()}
              type="button"
            >
              {mcpMutations.refresh.isPending ? "Refreshing…" : "Refresh"}
            </Button>
            <Button onClick={() => setDialog({ mode: "create" })} type="button">
              Add custom MCP server
            </Button>
          </div>
        }
        description="Manage global external MCP servers once, then reuse them safely across specialists through permissions."
        eyebrow="Integrations"
        title="External Apps"
      />

      {successMessage ? <section className="cc-success">{successMessage}</section> : null}

      {queryError ? (
        <ErrorState
          action={
            <Button
              variant="secondary"
              onClick={() => void mcpServersQuery.refetch()}
              type="button"
            >
              Try again
            </Button>
          }
          description={queryError}
          title="MCP servers could not be loaded."
        />
      ) : null}

      {mcpServersQuery.isLoading ? <LoadingState testId="mcp-loading" /> : null}

      {!mcpServersQuery.isLoading && !queryError ? (
        <ComposioSection
          activationError={activationError}
          busy={
            mcpMutations.create.isPending ||
            mcpMutations.authenticate.isPending ||
            mcpMutations.remove.isPending ||
            mcpMutations.removeAuth.isPending ||
            mcpMutations.setEnabled.isPending ||
            mcpMutations.activate.isPending
          }
          onActivate={requestActivation}
          onAdd={() => setComposioDialogOpen(true)}
          onAuthenticate={async (server) => {
            setSuccessMessage(undefined);
            const updated = await mcpMutations.authenticate.mutateAsync({ id: server.id });
            setSuccessMessage(`${updated.name} authenticated.`);
          }}
          onDisable={async (server) => {
            setSuccessMessage(undefined);
            setActivationError(undefined);
            await mcpMutations.setEnabled.mutateAsync({ id: server.id, enabled: false });
            setSuccessMessage(`${server.name} disabled.`);
          }}
          onRemove={async (server) => {
            if (!window.confirm(`Remove Composio connection '${server.name}'?`)) {
              return;
            }

            setSuccessMessage(undefined);
            await mcpMutations.remove.mutateAsync({ id: server.id });
            setSuccessMessage(`${server.name} removed.`);
          }}
          onRemoveAuth={async (server) => {
            setSuccessMessage(undefined);
            await mcpMutations.removeAuth.mutateAsync({ id: server.id });
            setSuccessMessage(`${server.name} credentials removed.`);
          }}
          servers={composioServers}
        />
      ) : null}

      {!mcpServersQuery.isLoading && !queryError ? (
        <CcInstancesSection
          activationError={activationError}
          busy={
            mcpMutations.setEnabled.isPending ||
            mcpMutations.activate.isPending ||
            mcpMutations.remove.isPending
          }
          onActivate={requestActivation}
          onAdd={() => setCcInstanceDialogOpen(true)}
          onDisable={async (server) => {
            setSuccessMessage(undefined);
            setActivationError(undefined);
            await mcpMutations.setEnabled.mutateAsync({ id: server.id, enabled: false });
            setSuccessMessage(`${server.name} disabled.`);
          }}
          onEdit={(server) => setDialog({ mode: "edit", server })}
          onRemove={async (server) => {
            if (!window.confirm(`Remove CC instance '${server.name}'?`)) {
              return;
            }

            setSuccessMessage(undefined);
            await mcpMutations.remove.mutateAsync({ id: server.id });
            setSuccessMessage(`${server.name} removed.`);
          }}
          servers={ccInstanceServers}
        />
      ) : null}

      {!mcpServersQuery.isLoading && !queryError ? (
        <SuggestedMcpServersSection
          configuredNames={customMcpServers.map((server) => server.name)}
          onSelect={(suggestion) =>
            setDialog({
              mode: "create",
              prefill: buildSuggestedMcpForm(
                suggestion,
                systemVersionQuery.data?.installMode === "docker",
              ),
            })
          }
        />
      ) : null}

      {!mcpServersQuery.isLoading && !queryError ? (
        <section className="cc-panel p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-text-primary">Configured MCP servers</h2>
                <SectionToggleButton
                  expanded={configuredExpanded}
                  label="Configured MCP servers"
                  onClick={() => setConfiguredExpanded((current) => !current)}
                />
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Global MCP registrations are persisted in the workspace DB and mirrored into
                `.cc/workspace/opencode.jsonc`.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
              {customMcpServers.length} server{customMcpServers.length === 1 ? "" : "s"}
            </div>
          </div>

          {configuredExpanded && customMcpServers.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {customMcpServers.map((server) => (
                <McpServerCard
                  key={server.id}
                  onAuthenticate={() => setAuthServer(server)}
                  onDuplicate={() =>
                    setDialog({
                      mode: "create",
                      prefill: buildDuplicateForm(
                        server,
                        mcpServers.map((existing) => existing.name),
                      ),
                    })
                  }
                  onEdit={() => setDialog({ mode: "edit", server })}
                  onRemoveAuth={async () => {
                    setSuccessMessage(undefined);
                    await mcpMutations.removeAuth.mutateAsync({ id: server.id });
                    setSuccessMessage(`${server.name} credentials removed.`);
                  }}
                  onRemove={async () => {
                    if (!window.confirm(`Remove MCP server '${server.name}'?`)) {
                      return;
                    }

                    setSuccessMessage(undefined);
                    await mcpMutations.remove.mutateAsync({ id: server.id });
                    setSuccessMessage(`${server.name} removed.`);
                  }}
                  onToggleEnabled={async () => {
                    setSuccessMessage(undefined);
                    const nextEnabled = !server.enabled;
                    await mcpMutations.setEnabled.mutateAsync({
                      id: server.id,
                      enabled: nextEnabled,
                    });
                    setSuccessMessage(`${server.name} ${nextEnabled ? "enabled" : "disabled"}.`);
                  }}
                  missingSecrets={server.missingSecrets ?? []}
                  server={server}
                  removingAuth={mcpMutations.removeAuth.isPending}
                  toggling={mcpMutations.setEnabled.isPending}
                />
              ))}
            </div>
          ) : null}

          {configuredExpanded && customMcpServers.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                description="Add an external MCP server to register it globally for this workspace."
                title="No MCP servers configured yet"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {dialog ? (
        <McpServerDialog
          agents={agents}
          busy={
            mcpMutations.create.isPending ||
            mcpMutations.update.isPending ||
            agentMutations.update.isPending
          }
          existingNames={mcpServers.map((server) => server.name)}
          initialServer={dialog.mode === "edit" ? dialog.server : undefined}
          mode={dialog.mode}
          prefill={dialog.mode === "create" ? dialog.prefill : undefined}
          onClose={() => setDialog(undefined)}
          secretKeys={secretKeys}
          unsetSecretKeys={unsetSecretKeys}
          onSubmit={async (input: {
            name: string;
            enabled?: boolean;
            agentIds: string[];
            config:
              | {
                  url: string;
                  transport: "streamable-http" | "sse";
                  authMethod: "none" | "oauth" | "headers";
                  headers: Array<{ key: string; value: string }>;
                }
              | {
                  transport: "stdio";
                  command: string[];
                  environment: Record<string, string>;
                };
          }) => {
            setSuccessMessage(undefined);
            const { agentIds, ...mcpInput } = input;

            if (dialog.mode === "create") {
              const created = await mcpMutations.create.mutateAsync({ ...mcpInput, enabled: true });
              await syncAgentAssignments({
                agents,
                mutateAgent: agentMutations.update.mutateAsync,
                selectedAgentIds: agentIds,
                previousServerName: undefined,
                nextServerName: created.name,
              });
              setSuccessMessage(buildAssignmentMessage(`${created.name} added.`, agentIds.length));

              if (
                created.config.transport !== "stdio" &&
                created.config.authMethod === "oauth" &&
                created.runtimeStatus?.status !== "connected"
              ) {
                setAuthServer(created);
              }
              return;
            }

            const updated = await mcpMutations.update.mutateAsync({
              id: dialog.server.id,
              input: mcpInput,
            });
            await syncAgentAssignments({
              agents,
              mutateAgent: agentMutations.update.mutateAsync,
              selectedAgentIds: agentIds,
              previousServerName: dialog.server.name,
              nextServerName: updated.name,
            });
            setSuccessMessage(buildAssignmentMessage(`${updated.name} updated.`, agentIds.length));
          }}
        />
      ) : null}

      {composioDialogOpen ? (
        <ComposioDialog
          busy={mcpMutations.create.isPending}
          existingNames={mcpServers.map((server) => server.name)}
          onClose={() => setComposioDialogOpen(false)}
          onSubmit={async (input) => {
            setSuccessMessage(undefined);

            await mcpMutations.create.mutateAsync({
              enabled: false,
              name: input.name,
              config: {
                transport: "streamable-http",
                url: COMPOSIO_SERVER_URL,
                authMethod: "headers",
                headers: [{ key: COMPOSIO_API_KEY_HEADER, value: input.apiKey }],
              },
            });

            setSuccessMessage(
              "Composio API key saved. Activate Composio when you are ready to restart the AI engine.",
            );
            setComposioDialogOpen(false);
          }}
        />
      ) : null}

      {ccInstanceDialogOpen ? (
        <CcInstanceDialog
          busy={mcpMutations.create.isPending || secretMutations.set.isPending}
          existingNames={mcpServers.map((server) => server.name)}
          existingSecretKeys={secretKeys}
          onClose={() => setCcInstanceDialogOpen(false)}
          onSubmit={async (input) => {
            setSuccessMessage(undefined);

            const created = await mcpMutations.create.mutateAsync({
              enabled: false,
              name: input.name,
              config: {
                transport: "streamable-http",
                url: input.url,
                authMethod: "headers",
                headers: [
                  {
                    key: CC_INSTANCE_AUTH_HEADER,
                    value: buildCcInstanceAuthHeaderValue(input.secretKey),
                  },
                ],
              },
            });
            await secretMutations.set.mutateAsync({
              key: input.secretKey,
              value: input.secretValue,
              restart: false,
            });

            setSuccessMessage(
              `${created.name} saved. Activate it when you are ready to restart the AI engine.`,
            );
            setCcInstanceDialogOpen(false);
          }}
        />
      ) : null}

      {restartConsent ? (
        <ConfirmDialog
          confirmDisabled={mcpMutations.activate.isPending}
          confirmLabel={mcpMutations.activate.isPending ? "Restarting…" : "Restart and activate"}
          description={
            <div className="grid gap-3">
              <p>
                The saved credentials for {restartConsent.name} are not loaded by the current AI
                engine. Restarting reloads them and briefly interrupts active specialist sessions.
              </p>
              {activeRunCount > 0 ? (
                <p className="text-warning-foreground">
                  {activeRunCount} task run{activeRunCount === 1 ? " is" : "s are"} currently
                  active. Cancel and activate later if you want to let{" "}
                  {activeRunCount === 1 ? "it" : "them"} finish first.
                </p>
              ) : null}
            </div>
          }
          onCancel={() => setRestartConsent(undefined)}
          onConfirm={() => {
            setRestartConsent(undefined);
            void activateServer(restartConsent, true);
          }}
          title={`Restart the AI engine to activate ${restartConsent.name}?`}
        />
      ) : null}

      {authServer ? (
        <McpAuthDialog
          browserBusy={mcpMutations.authenticate.isPending}
          composio={isComposioServer(authServer)}
          onAuthenticate={async () => {
            setSuccessMessage(undefined);
            const updated = await mcpMutations.authenticate.mutateAsync({
              id: authServer.id,
            });
            setSuccessMessage(`${updated.name} authenticated.`);
            setAuthServer(undefined);
          }}
          onClose={() => setAuthServer(undefined)}
          onConnected={(name) => {
            setSuccessMessage(`${name} authenticated.`);
            setAuthServer(undefined);
          }}
          onRefresh={async () => {
            const { data } = await mcpServersQuery.refetch();
            return data?.find((server) => server.id === authServer.id);
          }}
          onStartHosted={async () => {
            const result = await mcpMutations.startAuth.mutateAsync({ id: authServer.id });
            return result.authorizationUrl;
          }}
          server={authServer}
          startBusy={mcpMutations.startAuth.isPending}
        />
      ) : null}
    </div>
  );
}

function McpServerCard(props: {
  server: McpServer;
  missingSecrets: string[];
  toggling: boolean;
  removingAuth: boolean;
  onAuthenticate: () => void;
  onToggleEnabled: () => Promise<void>;
  onRemoveAuth: () => Promise<void>;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => Promise<void>;
}) {
  const config = props.server.config;
  const status = props.server.runtimeStatus ?? {
    status: props.server.enabled ? "disconnected" : "disabled",
  };

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{props.server.name}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-secondary">
            {props.server.config.transport}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(status)}>{friendlyStatus(status)}</Badge>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-surface-elevated/70 p-3">
          <dt className="text-text-secondary">Auth</dt>
          <dd className="mt-1 font-medium text-text-primary">
            {config.transport === "stdio" ? "local" : config.authMethod}
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated/70 p-3">
          <dt className="text-text-secondary">Headers</dt>
          <dd className="mt-1 font-medium text-text-primary">
            {config.transport === "stdio" ? 0 : config.headers.length}
          </dd>
        </div>
      </dl>

      <p className="mt-4 break-all text-xs text-text-secondary">{describeConfig(props.server)}</p>

      {props.missingSecrets.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warning-border bg-warning-surface p-3 text-xs text-warning-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Missing secret values</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {props.missingSecrets.map((secret) => (
                  <SecretKeyPill key={secret} secret={secret} />
                ))}
              </div>
            </div>
            <a
              aria-label="Open secrets in new tab"
              className="rounded-md p-1.5 text-warning transition hover:bg-warning/10"
              href="/settings"
              rel="noreferrer"
              target="_blank"
            >
              <OpenInNewIcon />
            </a>
          </div>
        </div>
      ) : null}

      {"error" in status ? <p className="mt-3 text-sm text-danger">{status.error}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {config.transport !== "stdio" && config.authMethod === "oauth" ? (
          <Button variant="secondary" onClick={props.onAuthenticate} type="button">
            {status.status === "connected" ? "Re-authenticate" : "Authenticate"}
          </Button>
        ) : null}
        {config.transport !== "stdio" &&
        config.authMethod === "oauth" &&
        status.status === "connected" ? (
          <Button variant="secondary" onClick={() => void props.onRemoveAuth()} type="button">
            {props.removingAuth ? "Removing..." : "Remove auth"}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => void props.onToggleEnabled()} type="button">
          {props.toggling ? "Updating..." : props.server.enabled ? "Disable" : "Enable"}
        </Button>
        <Button variant="secondary" onClick={props.onEdit} type="button">
          Edit
        </Button>
        <Button variant="secondary" onClick={props.onDuplicate} type="button">
          Duplicate
        </Button>
        <Button variant="danger" onClick={() => void props.onRemove()} type="button">
          Remove
        </Button>
      </div>
    </article>
  );
}

function SuggestedMcpServersSection(props: {
  configuredNames: string[];
  onSelect: (suggestion: SuggestedMcpServer) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = usePersistentBooleanState(SUGGESTED_SECTION_STORAGE_KEY, true);
  const [showAll, setShowAll] = usePersistentBooleanState(SUGGESTED_SHOW_ALL_STORAGE_KEY, false);
  const collapsedCount = useResponsiveSuggestionCount();
  const configured = new Set(props.configuredNames.map((name) => name.toLowerCase()));
  const available = SUGGESTED_MCP_SERVERS.filter(
    (suggestion) =>
      !configured.has(suggestion.name.toLowerCase()) &&
      !configured.has(suggestion.form.name.toLowerCase()),
  );

  if (available.length === 0) {
    return null;
  }

  const query = search.trim().toLowerCase();
  const searchActive = query.length > 0;
  const visible = query
    ? available.filter((suggestion) => {
        const haystack = [suggestion.name, suggestion.description, ...suggestion.tags]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : available;
  const showAllActive = searchActive || showAll;
  const renderedSuggestions = showAllActive ? visible : visible.slice(0, collapsedCount);
  const canToggleShowAll = !searchActive && visible.length > collapsedCount;

  return (
    <section className="cc-panel p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-text-primary">Suggested MCPs</h2>
            <SectionToggleButton
              expanded={expanded}
              label="Suggested MCPs"
              onClick={() => setExpanded((current) => !current)}
            />
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            One-click presets - Review the details and adjust before saving.
          </p>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="mt-5 grid gap-3">
            <div className="relative">
              <Input
                aria-label="Search suggested MCPs"
                className="pr-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, description, or tag (e.g. no-auth, oauth, search)"
                type="search"
                value={search}
              />
              {search ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <CloseIcon />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="uppercase tracking-[0.16em]">Try:</span>
              {SEARCH_SUGGESTIONS.map((term) => (
                <button
                  aria-label={`Search ${term}`}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
                  key={term}
                  onClick={() => setSearch(term)}
                  type="button"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-secondary">
              No suggestions match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {renderedSuggestions.map((suggestion) => (
                  <button
                    aria-label={`Add ${suggestion.name}`}
                    className="flex h-full flex-col items-start gap-2 rounded-lg border border-border bg-surface p-5 text-left transition hover:border-accent hover:bg-surface-elevated"
                    key={suggestion.id}
                    onClick={() => props.onSelect(suggestion)}
                    type="button"
                  >
                    <div className="flex w-full items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-text-primary">
                        {suggestion.name}
                      </h3>
                      <Badge>{suggestion.authBadge}</Badge>
                    </div>
                    <p className="text-sm text-text-secondary">{suggestion.description}</p>
                    <span className="mt-auto text-sm font-medium text-accent">Tap to connect</span>
                    <div className="mt-2 flex w-full flex-wrap gap-1.5">
                      {suggestion.tags.map((tag) => (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tagStyle(tag)}`}
                          key={tag}
                        >
                          {tagLabel(tag)}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>

              {canToggleShowAll ? (
                <div className="mt-5 flex justify-center">
                  <Button
                    variant="secondary"
                    aria-label={showAll ? "Show less suggested MCPs" : "Show all suggested MCPs"}
                    onClick={() => setShowAll((current) => !current)}
                    type="button"
                  >
                    {showAll ? "Show less" : "Show all"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
