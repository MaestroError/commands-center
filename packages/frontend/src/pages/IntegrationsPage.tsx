import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  Specialist,
  SpecialistCapabilitySelection,
  McpServer,
  UpdateSpecialistInput,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { PasswordInput } from "@/components/common/PasswordInput";
import { useSpecialistMutations, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import { getMcpServerSelection, setMcpServerEnabled } from "@/lib/specialist-capabilities";
import { useSecretsQuery } from "@/hooks/use-secrets-query";

type DialogState =
  | { mode: "create"; prefill?: FormState }
  | {
      mode: "edit";
      server: McpServer;
    };

type FormState = {
  name: string;
  url: string;
  transport: "streamable-http" | "sse" | "stdio";
  authMethod: "none" | "oauth" | "headers";
  headersText: string;
  commandText: string;
  environmentText: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

type SuggestedMcpServer = {
  id: string;
  name: string;
  description: string;
  authBadge: string;
  tags: string[];
  form: FormState;
};

type ComposioAuthMode = "oauth" | "api-key";

const EMPTY_FORM_BASE = {
  url: "",
  headersText: "",
  commandText: "",
  environmentText: "",
} as const;

const CONFIGURED_SECTION_STORAGE_KEY = "cc-integrations-configured-expanded";
const SUGGESTED_SECTION_STORAGE_KEY = "cc-integrations-suggested-expanded";
const SUGGESTED_SHOW_ALL_STORAGE_KEY = "cc-integrations-suggested-show-all";
const COMPOSIO_SERVER_URL = "https://connect.composio.dev/mcp";
const COMPOSIO_API_KEY_HEADER = "x-consumer-api-key";
const DEFAULT_COMPOSIO_NAME = "composio";

const SUGGESTED_MCP_SERVERS: SuggestedMcpServer[] = [
  {
    id: "notion",
    name: "Notion",
    description: "Pages, databases, and project docs in sync.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:productivity", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "notion",
      url: "https://mcp.notion.com/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "context7",
    name: "Context7",
    description: "Search product docs with richer context.",
    authBadge: "API key",
    tags: ["auth:api-key", "category:documentation", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "context7",
      url: "https://mcp.context7.com/mcp",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "CONTEXT7_API_KEY: {env:CONTEXT7_API_KEY}",
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, pull requests, and repo automation.",
    authBadge: "PAT",
    tags: ["auth:pat", "category:dev-tools", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "github",
      url: "https://api.githubcopilot.com/mcp/",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "Authorization: Bearer {env:GITHUB_TOKEN}",
    },
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Privacy-first web search via Brave's API.",
    authBadge: "API key",
    tags: [
      "auth:api-key",
      "category:search",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "brave-search",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@brave/brave-search-mcp-server",
      environmentText: "BRAVE_API_KEY={env:BRAVE_API_KEY}",
    },
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects, and cycles via Linear's official MCP.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:productivity", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "linear",
      url: "https://mcp.linear.app/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Inspect errors, releases, and performance issues.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:monitoring", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "sentry",
      url: "https://mcp.sentry.dev/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deployments, projects, and logs from Vercel.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:deployment", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "vercel",
      url: "https://mcp.vercel.com",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Project, database, and storage operations on Supabase.",
    authBadge: "OAuth",
    tags: ["auth:oauth", "category:database", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "supabase",
      url: "https://mcp.supabase.com/mcp",
      transport: "streamable-http",
      authMethod: "oauth",
    },
  },
  {
    id: "playwright",
    name: "Playwright",
    description: "Microsoft's official browser automation via accessibility tree.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:browser",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "playwright",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@playwright/mcp@latest",
    },
  },
  {
    id: "antv-chart",
    name: "AntV Charts",
    description: "Generate 25+ chart types (line, bar, pie, sankey, treemap, mind map).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:charts",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "antv-chart",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@antv/mcp-server-chart",
    },
  },
  {
    id: "mermaid",
    name: "Mermaid",
    description: "Render Mermaid diagrams (flowcharts, sequence, ER, gantt, class).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:diagrams",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "mermaid",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\nmcp-mermaid",
    },
  },
  {
    id: "fetcher",
    name: "Fetcher",
    description: "Playwright-based web fetcher with JS rendering, returns clean Markdown.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:web-fetching",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "fetcher",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\nfetcher-mcp",
    },
  },
  {
    id: "markitdown",
    name: "MarkItDown",
    description: "Convert PDF, DOCX, PPTX, XLSX, images, and audio to Markdown (Microsoft).",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:documents",
      "language:python",
      "launcher:uvx",
      "type:local",
      "source:official",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "markitdown",
      transport: "stdio",
      authMethod: "none",
      commandText: "uvx\nmarkitdown-mcp",
    },
  },
  {
    id: "duckduckgo",
    name: "DuckDuckGo",
    description: "Free web search with no API key required.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:search",
      "language:python",
      "launcher:uvx",
      "type:local",
      "source:community",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "duckduckgo",
      transport: "stdio",
      authMethod: "none",
      commandText: "uvx\nduckduckgo-mcp-server",
    },
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent knowledge graph stored locally. Anthropic reference implementation.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:memory",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:reference",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "memory",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@modelcontextprotocol/server-memory",
    },
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured step-by-step reasoning helper. Anthropic reference implementation.",
    authBadge: "No Auth",
    tags: [
      "auth:no-auth",
      "category:reasoning",
      "language:node",
      "launcher:npx",
      "type:local",
      "source:reference",
    ],
    form: {
      ...EMPTY_FORM_BASE,
      name: "sequential-thinking",
      transport: "stdio",
      authMethod: "none",
      commandText: "npx\n-y\n@modelcontextprotocol/server-sequential-thinking",
    },
  },
];

export function IntegrationsPage() {
  const agentsQuery = useSpecialistsQuery();
  const agentMutations = useSpecialistMutations();
  const mcpServersQuery = useMcpServersQuery();
  const mcpMutations = useMcpServerMutations();
  const secretsQuery = useSecretsQuery();
  const [dialog, setDialog] = useState<DialogState>();
  const [authServer, setAuthServer] = useState<McpServer>();
  const [composioDialogOpen, setComposioDialogOpen] = useState(false);
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

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              className="cc-button cc-button-secondary"
              disabled={mcpMutations.refresh.isPending}
              onClick={() => mcpMutations.refresh.mutate()}
              type="button"
            >
              {mcpMutations.refresh.isPending ? "Refreshing…" : "Refresh"}
            </button>
            <button
              className="cc-button"
              onClick={() => setDialog({ mode: "create" })}
              type="button"
            >
              Add custom MCP server
            </button>
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
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void mcpServersQuery.refetch()}
              type="button"
            >
              Try again
            </button>
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
            mcpMutations.setEnabled.isPending
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
          onDeactivate={async () => {
            if (!composioServer) {
              return;
            }

            if (!window.confirm(`Deactivate Composio MCP server '${composioServer.name}'?`)) {
              return;
            }

            setSuccessMessage(undefined);
            await mcpMutations.remove.mutateAsync({ id: composioServer.id });
            setSuccessMessage("Composio deactivated.");
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
            const nextEnabled = !composioServer.enabled;
            await mcpMutations.setEnabled.mutateAsync({
              id: composioServer.id,
              enabled: nextEnabled,
            });
            setSuccessMessage(`Composio ${nextEnabled ? "enabled" : "disabled"}.`);
          }}
          server={composioServer}
        />
      ) : null}

      {!mcpServersQuery.isLoading && !queryError ? (
        <SuggestedMcpServersSection
          configuredNames={customMcpServers.map((server) => server.name)}
          onSelect={(suggestion) => setDialog({ mode: "create", prefill: suggestion.form })}
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

            const created = await mcpMutations.create.mutateAsync({
              enabled: true,
              name: input.name,
              config:
                input.authMode === "oauth"
                  ? {
                      transport: "streamable-http",
                      url: COMPOSIO_SERVER_URL,
                      authMethod: "oauth",
                      headers: [],
                    }
                  : {
                      transport: "streamable-http",
                      url: COMPOSIO_SERVER_URL,
                      authMethod: "headers",
                      headers: [{ key: COMPOSIO_API_KEY_HEADER, value: input.apiKey }],
                    },
            });

            setSuccessMessage("Composio activated.");
            setComposioDialogOpen(false);

            if (input.authMode === "oauth" && created.runtimeStatus?.status !== "connected") {
              setAuthServer(created);
            }
          }}
        />
      ) : null}

      {authServer ? (
        <McpAuthDialog
          busy={mcpMutations.authenticate.isPending}
          onClose={() => setAuthServer(undefined)}
          onAuthenticate={async () => {
            setSuccessMessage(undefined);
            const updated = await mcpMutations.authenticate.mutateAsync({
              id: authServer.id,
            });
            setSuccessMessage(`${updated.name} authenticated.`);
            setAuthServer(undefined);
          }}
          server={authServer}
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
        <span className={statusBadgeClass(status)}>{friendlyStatus(status)}</span>
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
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
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
              className="rounded-md p-1.5 text-amber-500 transition hover:bg-amber-500/10"
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
          <button
            className="cc-button cc-button-secondary"
            onClick={props.onAuthenticate}
            type="button"
          >
            {status.status === "connected" ? "Re-authenticate" : "Authenticate"}
          </button>
        ) : null}
        {config.transport !== "stdio" &&
        config.authMethod === "oauth" &&
        status.status === "connected" ? (
          <button
            className="cc-button cc-button-secondary"
            onClick={() => void props.onRemoveAuth()}
            type="button"
          >
            {props.removingAuth ? "Removing..." : "Remove auth"}
          </button>
        ) : null}
        <button
          className="cc-button cc-button-secondary"
          onClick={() => void props.onToggleEnabled()}
          type="button"
        >
          {props.toggling ? "Updating..." : props.server.enabled ? "Disable" : "Enable"}
        </button>
        <button className="cc-button cc-button-secondary" onClick={props.onEdit} type="button">
          Edit
        </button>
        <button
          className="cc-button cc-button-danger"
          onClick={() => void props.onRemove()}
          type="button"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function ComposioSection(props: {
  server?: McpServer;
  busy: boolean;
  onActivate: () => void;
  onAuthenticate: () => Promise<void>;
  onRemoveAuth: () => Promise<void>;
  onToggleEnabled: () => Promise<void>;
  onDeactivate: () => Promise<void>;
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
          <button className="cc-button" onClick={props.onActivate} type="button">
            Connect Composio
          </button>
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
            <span className={statusBadgeClass(status)}>{friendlyStatus(status)}</span>
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
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void props.onAuthenticate()}
              type="button"
            >
              {status.status === "connected" ? "Re-authenticate" : "Authenticate"}
            </button>
          ) : null}
          {props.server.config.transport !== "stdio" &&
          props.server.config.authMethod === "oauth" &&
          status.status === "connected" ? (
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void props.onRemoveAuth()}
              type="button"
            >
              Remove auth
            </button>
          ) : null}
          <button
            className="cc-button cc-button-secondary"
            onClick={() => void props.onToggleEnabled()}
            type="button"
          >
            {props.busy ? "Updating..." : props.server.enabled ? "Disable" : "Enable"}
          </button>
          <button
            className="cc-button cc-button-danger"
            onClick={() => void props.onDeactivate()}
            type="button"
          >
            Deactivate
          </button>
        </div>
      </div>

      {"error" in status ? <p className="mt-3 text-sm text-danger">{status.error}</p> : null}
    </section>
  );
}

function ComposioDialog(props: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; authMode: ComposioAuthMode; apiKey: string }) => Promise<void>;
}) {
  const [name, setName] = useState(DEFAULT_COMPOSIO_NAME);
  const [authMode, setAuthMode] = useState<ComposioAuthMode>("oauth");
  const [apiKey, setApiKey] = useState("");
  const [submitError, setSubmitError] = useState<string>();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Connect Composio</h2>
            <p className="mt-1 text-sm text-text-secondary">
              CC manages the endpoint and transport. Choose how to authenticate this MCP server.
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field label="Name" required>
            <input
              aria-label="Composio name"
              className="cc-input"
              onChange={(event) => {
                setName(event.target.value);
                setSubmitError(undefined);
              }}
              value={name}
            />
          </Field>

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium text-text-primary">Authentication</legend>
            <label className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <input
                  aria-label="OAuth"
                  checked={authMode === "oauth"}
                  name="composio-auth-mode"
                  onChange={() => {
                    setAuthMode("oauth");
                    setSubmitError(undefined);
                  }}
                  type="radio"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">OAuth (Recommended)</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Browser-based sign-in delegated to the standard OpenCode MCP auth flow.
                  </p>
                </div>
              </div>
            </label>

            <label className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <input
                  aria-label="API key"
                  checked={authMode === "api-key"}
                  name="composio-auth-mode"
                  onChange={() => {
                    setAuthMode("api-key");
                    setSubmitError(undefined);
                  }}
                  type="radio"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">API key</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Sends your consumer key through the predefined{" "}
                    <code>{COMPOSIO_API_KEY_HEADER}</code> header.
                  </p>
                </div>
              </div>
            </label>
          </fieldset>

          {authMode === "api-key" ? (
            <Field label="Consumer API key" required>
              <PasswordInput
                aria-label="Consumer API key"
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setSubmitError(undefined);
                }}
                value={apiKey}
              />
            </Field>
          ) : null}

          {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

          <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
              Cancel
            </button>
            <button className="cc-button" disabled={props.busy} type="submit">
              {props.busy ? "Connecting..." : "Activate Composio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    if (!name.trim()) {
      setSubmitError("Name is required.");
      return;
    }

    if (authMode === "api-key" && !apiKey.trim()) {
      setSubmitError("Consumer API key is required.");
      return;
    }

    try {
      await props.onSubmit({
        name: name.trim(),
        authMode,
        apiKey: apiKey.trim(),
      });
    } catch (error) {
      setSubmitError(readError(error));
    }
  }
}

function McpAuthDialog(props: {
  server: McpServer;
  busy: boolean;
  onClose: () => void;
  onAuthenticate: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Authenticate {props.server.name}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              We&rsquo;ll open your default browser to complete sign-in. This window will update
              automatically when authentication succeeds.
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 gap-4 overflow-y-auto">
          <button
            className="cc-button"
            disabled={props.busy}
            onClick={() => void handleAuthenticate()}
            type="button"
          >
            {props.busy ? "Waiting for browser sign-in..." : "Authenticate in browser"}
          </button>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface pt-4">
          <button
            className="cc-button cc-button-secondary"
            disabled={props.busy}
            onClick={props.onClose}
            type="button"
          >
            {props.busy ? "Cancel disabled" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );

  async function handleAuthenticate() {
    setError(undefined);

    try {
      await props.onAuthenticate();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function McpServerDialog(props: {
  agents: Specialist[];
  mode: "create" | "edit";
  initialServer?: McpServer;
  prefill?: FormState;
  secretKeys: string[];
  unsetSecretKeys: Set<string>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
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
  }) => Promise<void>;
}) {
  const initialForm = useMemo<FormState>(
    () => props.prefill ?? createForm(props.initialServer),
    [props.initialServer, props.prefill],
  );
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string>();
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const agentSectionRef = useRef<HTMLElement>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(() =>
    props.agents
      .filter((agent) =>
        props.initialServer
          ? Boolean(getMcpServerSelection(agent.capabilities, props.initialServer.name)?.enabled)
          : false,
      )
      .map((agent) => agent.id),
  );
  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();

    return query
      ? props.agents.filter(
          (agent) =>
            agent.name.toLowerCase().includes(query) || agent.slug.toLowerCase().includes(query),
        )
      : props.agents;
  }, [agentSearch, props.agents]);
  const referencedSecretKeys = useMemo(
    () =>
      form.transport === "stdio"
        ? extractEnvRefs(form.environmentText)
        : extractEnvRefs(form.headersText),
    [form.environmentText, form.headersText, form.transport],
  );
  const missingSecrets = referencedSecretKeys.filter((key) => props.unsetSecretKeys.has(key));
  const unknownSecrets = referencedSecretKeys.filter((key) => !props.secretKeys.includes(key));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="cc-panel flex min-h-0 max-h-[calc(100vh-8rem)] w-full max-w-2xl flex-col overflow-hidden p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {props.mode === "create" ? "Add MCP server" : "Edit MCP server"}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Configure a global external MCP server for this workspace.
            </p>
          </div>
          <button
            className="rounded-md p-2 text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            onClick={props.onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="grid min-h-0 flex-1 auto-rows-max content-start gap-4 overflow-y-auto pr-1 pb-6">
            <Field error={errors.name} label="Name" required>
              <input
                aria-label="Name"
                className="cc-input"
                onChange={(event) => updateField("name", event.target.value)}
                value={form.name}
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field error={errors.transport} label="Transport" required>
                <select
                  aria-label="Transport"
                  className="cc-input"
                  onChange={(event) =>
                    updateField("transport", event.target.value as FormState["transport"])
                  }
                  value={form.transport}
                >
                  <option value="streamable-http">streamable-http</option>
                  <option value="sse">sse</option>
                  <option value="stdio">stdio</option>
                </select>
              </Field>

              <Field error={errors.authMethod} label="Auth method" required>
                <select
                  aria-label="Auth method"
                  className="cc-input"
                  onChange={(event) =>
                    updateField("authMethod", event.target.value as FormState["authMethod"])
                  }
                  disabled={form.transport === "stdio"}
                  value={form.authMethod}
                >
                  <option value="none">none</option>
                  <option value="oauth">oauth</option>
                  <option value="headers">headers</option>
                </select>
              </Field>
            </div>

            {form.transport === "stdio" ? (
              <>
                <Field error={errors.commandText} label="Command" required>
                  <textarea
                    aria-label="Command"
                    className="cc-input min-h-24 resize-y font-mono text-xs"
                    onChange={(event) => updateField("commandText", event.target.value)}
                    placeholder="npx\n-y\n@modelcontextprotocol/server-filesystem\n/Users/revazgh/Projects/cc"
                    value={form.commandText}
                  />
                </Field>

                <Field error={errors.environmentText} label="Environment">
                  <VariableTextarea
                    ariaLabel="Environment"
                    onChange={(value) => updateField("environmentText", value)}
                    placeholder="Example: API_TOKEN=secret. One variable per line."
                    secretKeys={props.secretKeys}
                    value={form.environmentText}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field error={errors.url} label="URL" required>
                  <input
                    aria-label="URL"
                    className="cc-input"
                    onChange={(event) => updateField("url", event.target.value)}
                    placeholder="https://example.com/mcp"
                    value={form.url}
                  />
                </Field>

                <Field error={errors.headersText} label="Headers">
                  <VariableTextarea
                    ariaLabel="Headers"
                    onChange={(value) => updateField("headersText", value)}
                    placeholder="Example: X-API-Key: value. One header per line."
                    secretKeys={props.secretKeys}
                    value={form.headersText}
                  />
                </Field>
              </>
            )}

            {missingSecrets.length > 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
                Referenced secrets without values: {missingSecrets.join(", ")}
              </div>
            ) : null}
            {unknownSecrets.length > 0 ? (
              <div className="rounded-lg border border-border bg-surface-elevated/70 p-3 text-sm text-text-secondary">
                New secrets will be created automatically: {unknownSecrets.join(", ")}
              </div>
            ) : null}

            <section
              ref={agentSectionRef}
              className="rounded-lg border border-border bg-surface-elevated/40"
            >
              <button
                aria-expanded={agentsExpanded}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-surface-elevated/60"
                onClick={() => toggleAgentsExpanded()}
                type="button"
              >
                <div>
                  <h3 className="text-sm font-medium text-text-primary">Enable for specialists</h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    Assign this MCP to selected specialists using the same capability update flow as
                    Specialist Editor.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-text-secondary">
                    {selectedAgentIds.length} selected
                  </span>
                  <ChevronIcon expanded={agentsExpanded} />
                </div>
              </button>

              {agentsExpanded ? (
                props.agents.length > 0 ? (
                  <div className="border-t border-border p-4 pt-3">
                    <input
                      aria-label="Search specialists"
                      className="cc-input"
                      onChange={(event) => setAgentSearch(event.target.value)}
                      placeholder="Search specialists"
                      value={agentSearch}
                    />
                    <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1">
                      {filteredAgents.map((agent) => {
                        const selected = selectedAgentIds.includes(agent.id);

                        return (
                          <label
                            className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                            key={agent.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-primary">
                                {agent.name}
                              </p>
                              <p className="truncate text-xs text-text-secondary">{agent.slug}</p>
                            </div>
                            <input
                              aria-label={agent.name}
                              checked={selected}
                              onChange={() => toggleAgentSelection(agent.id)}
                              type="checkbox"
                            />
                          </label>
                        );
                      })}
                      {filteredAgents.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-text-secondary">
                          No specialists match the current search.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-border p-4 text-sm text-text-secondary">
                    No active specialists available.
                  </p>
                )
              ) : null}
            </section>

            {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}
          </div>

          <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-surface pt-4">
            <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
              Cancel
            </button>
            <button className="cc-button" disabled={props.busy} type="submit">
              {props.busy ? "Saving..." : props.mode === "create" ? "Add server" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSubmitError(undefined);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);
    const validation = validateForm(form);
    setErrors(validation);

    if (Object.values(validation).some(Boolean)) {
      return;
    }

    try {
      const input = {
        name: form.name.trim(),
        ...(props.mode === "create" ? { enabled: true } : {}),
        agentIds: selectedAgentIds,
        config:
          form.transport === "stdio"
            ? {
                transport: "stdio" as const,
                command: parseCommand(form.commandText),
                environment: parseEnvironment(form.environmentText),
              }
            : {
                url: form.url.trim(),
                transport: form.transport,
                authMethod: form.authMethod,
                headers: parseHeaders(form.headersText),
              },
      };

      await props.onSubmit(input);
      props.onClose();
    } catch (error) {
      setSubmitError(readError(error));
    }
  }

  function toggleAgentSelection(agentId: string) {
    setSelectedAgentIds((current) =>
      current.includes(agentId)
        ? current.filter((value) => value !== agentId)
        : [...current, agentId],
    );
  }

  function toggleAgentsExpanded() {
    setAgentsExpanded((current) => {
      const nextExpanded = !current;

      if (nextExpanded) {
        requestAnimationFrame(() => {
          agentSectionRef.current?.scrollIntoView({ block: "nearest" });
        });
      }

      return nextExpanded;
    });
  }
}

function Field(props: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm text-text-primary">
      <span>
        {props.label}
        {props.required ? <span className="ml-1 text-danger">*</span> : null}
      </span>
      {props.children}
      {props.error ? <span className="text-sm text-danger">{props.error}</span> : null}
    </label>
  );
}

function VariableTextarea(props: {
  ariaLabel: string;
  value: string;
  placeholder: string;
  secretKeys: string[];
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const referencedKeys = extractEnvRefs(props.value);
  const candidateKeys = useMemo(() => {
    const unique = [...new Set([...referencedKeys, ...props.secretKeys])];
    const query = search.trim().toLowerCase();
    return query ? unique.filter((key) => key.toLowerCase().includes(query)) : unique;
  }, [props.secretKeys, referencedKeys, search]);

  return (
    <div className="grid gap-3">
      <textarea
        aria-label={props.ariaLabel}
        className="cc-input min-h-32 resize-y font-mono text-xs"
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        ref={textareaRef}
        value={props.value}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="cc-button cc-button-secondary"
          onClick={() => setPickerOpen((current) => !current)}
          type="button"
        >
          {pickerOpen ? "Hide variables" : "Variables"}
        </button>
        <span className="text-xs text-text-secondary">
          Click a variable to insert and copy <code>{"{env:...}"}</code>.
        </span>
      </div>
      {pickerOpen ? (
        <div className="grid gap-3 rounded-lg border border-border bg-surface-elevated/70 p-3">
          <input
            aria-label={`${props.ariaLabel} variable search`}
            className="cc-input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search variables"
            value={search}
          />
          <div className="flex flex-wrap gap-2">
            {candidateKeys.map((key) => (
              <button
                className="cc-button cc-button-secondary font-mono text-xs"
                key={key}
                onClick={() => void handleInsert(key)}
                type="button"
              >
                {key}
              </button>
            ))}
            {candidateKeys.length === 0 && search.trim() ? (
              <button
                className="cc-button cc-button-secondary font-mono text-xs"
                onClick={() =>
                  void handleInsert(
                    search
                      .trim()
                      .replace(/[^A-Za-z0-9_]/g, "_")
                      .toUpperCase(),
                  )
                }
                type="button"
              >
                Create{" "}
                {search
                  .trim()
                  .replace(/[^A-Za-z0-9_]/g, "_")
                  .toUpperCase()}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  async function handleInsert(key: string) {
    const token = `{env:${key}}`;
    const textarea = textareaRef.current;

    if (!textarea) {
      props.onChange([props.value, token].filter(Boolean).join("\n"));
    } else {
      const start = textarea.selectionStart ?? props.value.length;
      const end = textarea.selectionEnd ?? props.value.length;
      props.onChange(`${props.value.slice(0, start)}${token}${props.value.slice(end)}`);
    }

    await navigator.clipboard.writeText(token).catch(() => undefined);
    setSearch("");
  }
}

function SecretKeyPill(props: { secret: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 font-mono text-[11px]">
      <button
        className="transition hover:text-amber-400"
        onClick={() => void handleCopy()}
        title={`Copy ${props.secret}`}
        type="button"
      >
        {props.secret}
      </button>
      <button
        aria-label={`Copy ${props.secret}`}
        className="rounded-sm p-0.5 transition hover:bg-amber-500/10 hover:text-amber-400"
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

function friendlyStatus(status: { status: string }): string {
  switch (status.status) {
    case "connected":
      return "Connected";
    case "needs_auth":
      return "Needs auth";
    case "needs_client_registration":
      return "Needs registration";
    case "failed":
      return "Error";
    case "disabled":
      return "Disabled";
    default:
      return "Disconnected";
  }
}

function statusBadgeClass(status: { status: string }): string {
  switch (status.status) {
    case "connected":
      return "cc-badge cc-badge-connected";
    case "needs_auth":
    case "needs_client_registration":
      return "cc-badge bg-amber-500/15 text-amber-500";
    case "failed":
      return "cc-badge bg-danger/15 text-danger";
    default:
      return "cc-badge cc-badge-muted";
  }
}

function createForm(server?: McpServer): FormState {
  const cfg = server?.config;

  return {
    name: server?.name ?? "",
    url: !cfg || cfg.transport === "stdio" ? "" : cfg.url,
    transport: cfg?.transport ?? "streamable-http",
    authMethod: !cfg || cfg.transport === "stdio" ? "none" : cfg.authMethod,
    headersText:
      !cfg || cfg.transport === "stdio"
        ? ""
        : cfg.headers
            .map((header: { key: string; value: string }) => `${header.key}: ${header.value}`)
            .join("\n"),
    commandText: !cfg || cfg.transport !== "stdio" ? "" : cfg.command.join("\n"),
    environmentText:
      !cfg || cfg.transport !== "stdio"
        ? ""
        : Object.entries(cfg.environment)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
  };
}

function isComposioServer(server: McpServer): boolean {
  return server.config.transport !== "stdio" && server.config.url === COMPOSIO_SERVER_URL;
}

function validateForm(form: FormState): FormErrors {
  return {
    name: form.name.trim() ? undefined : "Name is required.",
    url:
      form.transport === "stdio"
        ? undefined
        : isValidUrl(form.url.trim())
          ? undefined
          : "A valid URL is required.",
    transport: form.transport ? undefined : "Transport is required.",
    authMethod:
      form.transport === "stdio" || form.authMethod ? undefined : "Auth method is required.",
    headersText: form.transport === "stdio" ? undefined : validateHeaders(form.headersText),
    commandText:
      form.transport !== "stdio" || parseCommandError(form.commandText) === undefined
        ? undefined
        : parseCommandError(form.commandText),
    environmentText:
      form.transport !== "stdio" || parseEnvironmentError(form.environmentText) === undefined
        ? undefined
        : parseEnvironmentError(form.environmentText),
  };
}

function describeConfig(server: McpServer): string {
  if (server.config.transport === "stdio") {
    return server.config.command.join(" ");
  }

  return server.config.url;
}

function validateHeaders(value: string): string | undefined {
  try {
    parseHeaders(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

function parseHeaders(value: string): Array<{ key: string; value: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        throw new Error("Headers must use 'Key: Value' format.");
      }

      const key = line.slice(0, separator).trim();
      const headerValue = line.slice(separator + 1).trim();
      if (!key || !headerValue) {
        throw new Error("Headers must use 'Key: Value' format.");
      }

      return { key, value: headerValue };
    });
}

function parseCommand(value: string): string[] {
  const command = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (command.length === 0) {
    throw new Error("At least one command segment is required.");
  }

  return command;
}

function parseCommandError(value: string): string | undefined {
  try {
    parseCommand(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

function parseEnvironment(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator <= 0) {
          throw new Error("Environment entries must use 'KEY=value' format.");
        }

        const key = line.slice(0, separator).trim();
        const envValue = line.slice(separator + 1).trim();
        if (!key) {
          throw new Error("Environment entries must use 'KEY=value' format.");
        }

        return [key, envValue] as const;
      }),
  );
}

function parseEnvironmentError(value: string): string | undefined {
  try {
    parseEnvironment(value);
    return undefined;
  } catch (error) {
    return readError(error);
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

function extractEnvRefs(value: string): string[] {
  const matches = value.matchAll(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g);
  return [...new Set(Array.from(matches, (match) => match[1] ?? "").filter(Boolean))];
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value).catch(() => undefined);
}

async function syncAgentAssignments(options: {
  agents: Specialist[];
  selectedAgentIds: string[];
  previousServerName?: string;
  nextServerName: string;
  mutateAgent: (input: { id: string; input: UpdateSpecialistInput }) => Promise<Specialist>;
}) {
  const selectedIds = new Set(options.selectedAgentIds);
  const previousServerName = options.previousServerName;

  const updates = options.agents.flatMap((agent) => {
    const hadPreviousAssignment = previousServerName
      ? Boolean(getMcpServerSelection(agent.capabilities, previousServerName)?.enabled)
      : false;
    const wantsAssignment = selectedIds.has(agent.id);

    if (!hadPreviousAssignment && !wantsAssignment) {
      return [];
    }

    let nextCapabilities: SpecialistCapabilitySelection = agent.capabilities;

    if (previousServerName && previousServerName !== options.nextServerName) {
      nextCapabilities = setMcpServerEnabled(nextCapabilities, previousServerName, false);
    }

    nextCapabilities = setMcpServerEnabled(
      nextCapabilities,
      options.nextServerName,
      wantsAssignment,
    );

    if (JSON.stringify(nextCapabilities) === JSON.stringify(agent.capabilities)) {
      return [];
    }

    return [
      options.mutateAgent({
        id: agent.id,
        input: {
          capabilities: nextCapabilities,
        },
      }),
    ];
  });

  await Promise.all(updates);
}

function buildAssignmentMessage(baseMessage: string, assignedAgentCount: number): string {
  return assignedAgentCount > 0
    ? `${baseMessage} Enabled for ${assignedAgentCount} specialist${assignedAgentCount === 1 ? "" : "s"}.`
    : baseMessage;
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 9.75A2.25 2.25 0 0 1 11.25 7.5h7.5A2.25 2.25 0 0 1 21 9.75v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 9 17.25v-7.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M15 7.5v-.75A2.25 2.25 0 0 0 12.75 4.5h-7.5A2.25 2.25 0 0 0 3 6.75v7.5a2.25 2.25 0 0 0 2.25 2.25H6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4.5 12.75L10.5 18L19.5 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function OpenInNewIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M13.5 4.5H19.5V10.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 13.5L19.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M19.5 13.5V17.25A2.25 2.25 0 0 1 17.25 19.5H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75A2.25 2.25 0 0 1 6.75 4.5H10.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const SEARCH_SUGGESTIONS = [
  "no-auth",
  "oauth",
  "official",
  "remote",
  "local",
  "search",
  "browser",
  "reasoning",
] as const;

const TAG_PREFIX_STYLES: Record<string, string> = {
  auth: "bg-sky-500/15 text-sky-400",
  category: "bg-violet-500/15 text-violet-400",
  language: "bg-emerald-500/15 text-emerald-400",
  launcher: "bg-amber-500/15 text-amber-400",
  type: "bg-cyan-500/15 text-cyan-400",
  source: "bg-rose-500/15 text-rose-400",
};
const DEFAULT_TAG_STYLE = "bg-surface-elevated text-text-secondary";

function tagStyle(tag: string): string {
  const idx = tag.indexOf(":");
  const prefix = idx === -1 ? tag : tag.slice(0, idx);
  return TAG_PREFIX_STYLES[prefix] ?? DEFAULT_TAG_STYLE;
}

function tagLabel(tag: string): string {
  const idx = tag.indexOf(":");
  return idx === -1 ? tag : tag.slice(idx + 1);
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
              <input
                aria-label="Search suggested MCPs"
                className="cc-input pr-10"
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
                      <span className="cc-badge cc-badge-muted">{suggestion.authBadge}</span>
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
                  <button
                    aria-label={showAll ? "Show less suggested MCPs" : "Show all suggested MCPs"}
                    className="cc-button cc-button-secondary"
                    onClick={() => setShowAll((current) => !current)}
                    type="button"
                  >
                    {showAll ? "Show less" : "Show all"}
                  </button>
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

function ChevronIcon(props: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`transition-transform ${props.expanded ? "rotate-180" : ""}`}
      fill="none"
      height="14"
      viewBox="0 0 24 24"
      width="14"
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function usePersistentBooleanState(
  storageKey: string,
  defaultValue: boolean,
): readonly [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === null) {
        return defaultValue;
      }

      return stored === "true";
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, value ? "true" : "false");
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, value]);

  return [value, setValue] as const;
}

function useResponsiveSuggestionCount(): number {
  const [count, setCount] = useState(getResponsiveSuggestionCount);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const largeQuery = window.matchMedia("(min-width: 1280px)");
    const mediumQuery = window.matchMedia("(min-width: 768px)");
    const updateCount = () => setCount(getResponsiveSuggestionCount());

    updateCount();
    largeQuery.addEventListener("change", updateCount);
    mediumQuery.addEventListener("change", updateCount);

    return () => {
      largeQuery.removeEventListener("change", updateCount);
      mediumQuery.removeEventListener("change", updateCount);
    };
  }, []);

  return count;
}

function getResponsiveSuggestionCount(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return 1;
  }

  if (window.matchMedia("(min-width: 1280px)").matches) {
    return 3;
  }

  if (window.matchMedia("(min-width: 768px)").matches) {
    return 2;
  }

  return 1;
}

function CloseIcon() {
  return (
    <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path
        d="M6 18 18 6M6 6l12 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
