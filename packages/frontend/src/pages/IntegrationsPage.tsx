import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import { useSecretsQuery } from "@/hooks/use-secrets-query";
import { useSpecialistMutations, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useSystemVersionQuery } from "@/hooks/use-system-version-query";
import { useActiveTaskRunsQuery } from "@/hooks/use-tasks-query";
import { McpEngineRestartRequiredError } from "@/lib/api";
import type { McpServer } from "@cc/shared/schemas";
import { useState } from "react";
import { ComposioDialog, McpAuthDialog } from "./integrations/integration-dialogs";
import {
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
  buildDuplicateForm,
  buildSuggestedMcpForm,
  copyText,
  describeConfig,
  friendlyStatus,
  isComposioServer,
  readError,
  statusBadgeVariant,
  syncAgentAssignments,
  tagLabel,
  tagStyle,
  usePersistentBooleanState,
  useResponsiveSuggestionCount,
} from "./integrations/integration-helpers";
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CopyIcon,
  OpenInNewIcon,
} from "./integrations/integration-icons";
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
  const activeRunsQuery = useActiveTaskRunsQuery();
  const systemVersionQuery = useSystemVersionQuery();
  const [dialog, setDialog] = useState<DialogState>();
  const [authServer, setAuthServer] = useState<McpServer>();
  const [composioDialogOpen, setComposioDialogOpen] = useState(false);
  const [confirmingComposioRestart, setConfirmingComposioRestart] = useState(false);
  const [composioActivationError, setComposioActivationError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [configuredExpanded, setConfiguredExpanded] = usePersistentBooleanState(
    CONFIGURED_SECTION_STORAGE_KEY,
    true,
  );
  const queryError = mcpServersQuery.error ? readError(mcpServersQuery.error) : undefined;
  const mcpServers = mcpServersQuery.data ?? [];
  const composioServer = mcpServers.find(isComposioServer);
  const customMcpServers = mcpServers.filter((server) => !isComposioServer(server));
  const agents = agentsQuery.data ?? [];
  const secretMeta = secretsQuery.data ?? [];
  const secretKeys = secretMeta.map((secret) => secret.key);
  const unsetSecretKeys = new Set(
    secretMeta.filter((secret) => !secret.isSet).map((secret) => secret.key),
  );
  const activeRunCount =
    activeRunsQuery.data?.filter((run) => run.status === "running").length ?? 0;

  async function activateComposio(restartEngine: boolean): Promise<void> {
    if (!composioServer) {
      return;
    }

    setComposioActivationError(undefined);

    try {
      await mcpMutations.activate.mutateAsync({ id: composioServer.id, restartEngine });
      setSuccessMessage("Composio activated.");
    } catch (error) {
      if (!restartEngine && error instanceof McpEngineRestartRequiredError) {
        setConfirmingComposioRestart(true);
        return;
      }

      setComposioActivationError(readError(error));
    }
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
          busy={
            mcpMutations.create.isPending ||
            mcpMutations.authenticate.isPending ||
            mcpMutations.remove.isPending ||
            mcpMutations.removeAuth.isPending ||
            mcpMutations.setEnabled.isPending ||
            mcpMutations.activate.isPending
          }
          onActivate={() => setComposioDialogOpen(true)}
          onAuthenticate={async () => {
            if (!composioServer) {
              return;
            }

            setSuccessMessage(undefined);
            const updated = await mcpMutations.authenticate.mutateAsync({ id: composioServer.id });
            setSuccessMessage(`${updated.name} authenticated.`);
          }}
          onRemove={async () => {
            if (!composioServer) {
              return;
            }

            if (!window.confirm(`Remove Composio integration '${composioServer.name}'?`)) {
              return;
            }

            setSuccessMessage(undefined);
            await mcpMutations.remove.mutateAsync({ id: composioServer.id });
            setSuccessMessage("Composio removed.");
          }}
          onRemoveAuth={async () => {
            if (!composioServer) {
              return;
            }

            setSuccessMessage(undefined);
            await mcpMutations.removeAuth.mutateAsync({ id: composioServer.id });
            setSuccessMessage(`${composioServer.name} credentials removed.`);
          }}
          onToggleEnabled={async () => {
            if (!composioServer) {
              return;
            }

            setSuccessMessage(undefined);
            setComposioActivationError(undefined);

            if (composioServer.enabled) {
              await mcpMutations.setEnabled.mutateAsync({
                id: composioServer.id,
                enabled: false,
              });
              setSuccessMessage("Composio disabled.");
              return;
            }

            if (composioServer.requiresEngineRestart) {
              setConfirmingComposioRestart(true);
              return;
            }

            await activateComposio(false);
          }}
          activationError={composioActivationError}
          server={composioServer}
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

      {confirmingComposioRestart ? (
        <ConfirmDialog
          confirmDisabled={mcpMutations.activate.isPending}
          confirmLabel={mcpMutations.activate.isPending ? "Restarting…" : "Restart and activate"}
          description={
            <div className="grid gap-3">
              <p>
                The saved Composio API key is not loaded by the current AI engine. Restarting
                reloads the key and briefly interrupts active specialist sessions.
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
          onCancel={() => setConfirmingComposioRestart(false)}
          onConfirm={() => {
            setConfirmingComposioRestart(false);
            void activateComposio(true);
          }}
          title="Restart the AI engine to activate Composio?"
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

function ComposioSection(props: {
  server?: McpServer;
  activationError?: string;
  busy: boolean;
  onActivate: () => void;
  onAuthenticate: () => Promise<void>;
  onRemoveAuth: () => Promise<void>;
  onToggleEnabled: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  if (!props.server) {
    return (
      <section className="cc-panel p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-text-primary">Composio</h2>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Connect to unlock actions across apps like GitHub, Slack, Notion, Linear, HubSpot, and
              more.
            </p>
            <p className="mt-2 text-xs text-text-secondary">
              <a
                className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent"
                href="https://composio.dev/for-you"
                rel="noreferrer"
                target="_blank"
              >
                Learn More
              </a>
            </p>
            <p className="mt-1 text-[11px] text-text-secondary">
              Composio has a generous free plan for getting started.
            </p>
            <p className="mt-2 text-xs text-text-secondary">
              <a
                className="font-mono hover:text-text-primary"
                href={COMPOSIO_SERVER_URL}
                rel="noreferrer"
                target="_blank"
              >
                {COMPOSIO_SERVER_URL}
              </a>{" "}
              is preconfigured by CC.
            </p>
          </div>
          <Button disabled={props.busy} onClick={props.onActivate} type="button">
            Connect Composio
          </Button>
        </div>
      </section>
    );
  }

  const status = props.server.runtimeStatus ?? {
    status: props.server.enabled ? "disconnected" : "disabled",
  };
  const authLabel =
    props.server.config.transport === "stdio"
      ? "local"
      : props.server.config.authMethod === "headers"
        ? "API key"
        : "OAuth";

  return (
    <section className="cc-panel p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-text-primary">Composio</h2>
            <Badge variant={statusBadgeVariant(status)}>{friendlyStatus(status)}</Badge>
            {!props.server.enabled ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                Globally disabled
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Connect your workspace to external apps through Composio, including GitHub, Slack,
            Notion, Linear, HubSpot, and other supported services.
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            Server <code>{props.server.name}</code> via {authLabel}. Endpoint:{" "}
            <code>{COMPOSIO_SERVER_URL}</code>
          </p>
          <p className="mt-2 text-xs text-text-secondary">
            <a
              className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent"
              href="https://dashboard.composio.dev/"
              rel="noreferrer"
              target="_blank"
            >
              Open Dashboard
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.server.config.transport !== "stdio" &&
          props.server.config.authMethod === "oauth" ? (
            <Button
              variant="secondary"
              disabled={props.busy}
              onClick={() => void props.onAuthenticate()}
              type="button"
            >
              {status.status === "connected" ? "Re-authenticate" : "Authenticate"}
            </Button>
          ) : null}
          {props.server.config.transport !== "stdio" &&
          props.server.config.authMethod === "oauth" &&
          status.status === "connected" ? (
            <Button
              variant="secondary"
              disabled={props.busy}
              onClick={() => void props.onRemoveAuth()}
              type="button"
            >
              Remove auth
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={props.busy}
            onClick={() => void props.onToggleEnabled()}
            type="button"
          >
            {props.busy ? "Updating..." : props.server.enabled ? "Disable" : "Activate"}
          </Button>
          <Button
            variant="danger"
            disabled={props.busy}
            onClick={() => void props.onRemove()}
            type="button"
          >
            Remove
          </Button>
        </div>
      </div>

      {"error" in status ? <p className="mt-3 text-sm text-danger">{status.error}</p> : null}
      {props.server.requiresEngineRestart && !props.server.enabled ? (
        <p className="mt-3 text-sm text-warning-foreground">
          Activating Composio requires an AI engine restart to load the saved API key.
        </p>
      ) : null}
      {props.activationError ? (
        <p className="mt-3 text-sm text-danger">{props.activationError}</p>
      ) : null}
    </section>
  );
}

function SecretKeyPill(props: { secret: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-warning-border bg-warning-surface px-2 py-1 font-mono text-[11px]">
      <button
        className="transition hover:text-warning"
        onClick={() => void handleCopy()}
        title={`Copy ${props.secret}`}
        type="button"
      >
        {props.secret}
      </button>
      <button
        aria-label={`Copy ${props.secret}`}
        className="rounded-sm p-0.5 transition hover:bg-warning/10 hover:text-warning"
        onClick={() => void handleCopy()}
        type="button"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );

  async function handleCopy() {
    await copyText(props.secret);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1200);
  }
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

function SectionToggleButton(props: { expanded: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-expanded={props.expanded}
      aria-label={`${props.expanded ? "Collapse" : "Expand"} ${props.label}`}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
      onClick={props.onClick}
      type="button"
    >
      {props.expanded ? "Collapse" : "Expand"}
      <ChevronIcon expanded={props.expanded} />
    </button>
  );
}
