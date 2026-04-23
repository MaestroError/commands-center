import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { McpServer } from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

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

const EMPTY_FORM_BASE = {
  url: "",
  headersText: "",
  commandText: "",
  environmentText: "",
} as const;

const CONFIGURED_SECTION_STORAGE_KEY = "cc-integrations-configured-expanded";
const SUGGESTED_SECTION_STORAGE_KEY = "cc-integrations-suggested-expanded";
const SUGGESTED_SHOW_ALL_STORAGE_KEY = "cc-integrations-suggested-show-all";

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
      headersText: "CONTEXT7_API_KEY: <your-context7-api-key>",
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
      headersText: "Authorization: Bearer <your-github-personal-access-token>",
    },
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Privacy-first web search via Brave's API.",
    authBadge: "API token",
    tags: ["auth:api-key", "category:search", "type:remote", "source:official"],
    form: {
      ...EMPTY_FORM_BASE,
      name: "brave-search",
      url: "https://mcp.brave.com/mcp",
      transport: "streamable-http",
      authMethod: "headers",
      headersText: "X-Subscription-Token: <your-brave-api-key>",
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
      url: "https://mcp.vercel.com/",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
    authBadge: "Local",
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
  const mcpServersQuery = useMcpServersQuery();
  const mcpMutations = useMcpServerMutations();
  const [dialog, setDialog] = useState<DialogState>();
  const [authServer, setAuthServer] = useState<McpServer>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const [configuredExpanded, setConfiguredExpanded] = usePersistentBooleanState(
    CONFIGURED_SECTION_STORAGE_KEY,
    true,
  );
  const queryError = mcpServersQuery.error ? readError(mcpServersQuery.error) : undefined;
  const mcpServers = mcpServersQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void mcpServersQuery.refetch()}
              type="button"
            >
              Refresh
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
        description="Manage global external MCP servers once, then reuse them safely across agents through permissions."
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
        <SuggestedMcpServersSection
          configuredNames={mcpServers.map((server) => server.name)}
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
              {mcpServers.length} server{mcpServers.length === 1 ? "" : "s"}
            </div>
          </div>

          {configuredExpanded && mcpServers.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {mcpServers.map((server) => (
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
                  server={server}
                  removingAuth={mcpMutations.removeAuth.isPending}
                  toggling={mcpMutations.setEnabled.isPending}
                />
              ))}
            </div>
          ) : null}

          {configuredExpanded && mcpServers.length === 0 ? (
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
          busy={mcpMutations.create.isPending || mcpMutations.update.isPending}
          initialServer={dialog.mode === "edit" ? dialog.server : undefined}
          mode={dialog.mode}
          prefill={dialog.mode === "create" ? dialog.prefill : undefined}
          onClose={() => setDialog(undefined)}
          onSubmit={async (input: {
            name: string;
            enabled?: boolean;
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

            if (dialog.mode === "create") {
              const created = await mcpMutations.create.mutateAsync({ ...input, enabled: true });
              setSuccessMessage(`${created.name} added.`);

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
              input,
            });
            setSuccessMessage(`${updated.name} updated.`);
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
        <div className="rounded-lg border border-border bg-surface-elevated/70 p-3">
          <dt className="text-text-secondary">Tools</dt>
          <dd className="mt-1 font-medium text-text-primary">{props.server.tools.length}</dd>
        </div>
      </dl>

      <p className="mt-4 break-all text-xs text-text-secondary">{describeConfig(props.server)}</p>

      {"error" in status ? <p className="mt-3 text-sm text-danger">{status.error}</p> : null}

      {props.server.tools.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {props.server.tools.slice(0, 6).map((tool) => (
            <span key={tool.id} className="cc-badge cc-badge-muted">
              {tool.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">No tools discovered yet.</p>
      )}

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

function McpAuthDialog(props: {
  server: McpServer;
  busy: boolean;
  onClose: () => void;
  onAuthenticate: () => Promise<void>;
}) {
  const [error, setError] = useState<string>();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm">
      <div className="cc-panel w-full max-w-xl p-6">
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

        <div className="mt-6 grid gap-4">
          <button
            className="cc-button"
            disabled={props.busy}
            onClick={() => void handleAuthenticate()}
            type="button"
          >
            {props.busy ? "Waiting for browser sign-in..." : "Authenticate in browser"}
          </button>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
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
  mode: "create" | "edit";
  initialServer?: McpServer;
  prefill?: FormState;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    enabled?: boolean;
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/60 p-4 backdrop-blur-sm">
      <div className="cc-panel w-full max-w-2xl p-6">
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

        <form className="mt-6 grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
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
                <textarea
                  aria-label="Environment"
                  className="cc-input min-h-24 resize-y font-mono text-xs"
                  onChange={(event) => updateField("environmentText", event.target.value)}
                  placeholder="Example: API_TOKEN=secret. One variable per line."
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
                <textarea
                  aria-label="Headers"
                  className="cc-input min-h-32 resize-y font-mono text-xs"
                  onChange={(event) => updateField("headersText", event.target.value)}
                  placeholder="Example: X-API-Key: value. One header per line."
                  value={form.headersText}
                />
              </Field>
            </>
          )}

          {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
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
