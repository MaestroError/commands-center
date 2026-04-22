import { useMemo, useState } from "react";

import type { McpServer } from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useMcpServerMutations, useMcpServersQuery } from "@/hooks/use-mcp-servers-query";

type DialogState =
  | { mode: "create" }
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

export function IntegrationsPage() {
  const mcpServersQuery = useMcpServersQuery();
  const mcpMutations = useMcpServerMutations();
  const [dialog, setDialog] = useState<DialogState>();
  const [authServer, setAuthServer] = useState<McpServer>();
  const [successMessage, setSuccessMessage] = useState<string>();
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
              Add MCP server
            </button>
          </div>
        }
        description="Manage global external MCP servers once, then reuse them safely across agents through workspace-backed permissions."
        eyebrow="Integrations"
        title="External MCP servers"
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
        <section className="cc-panel p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Configured MCP servers</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Global MCP registrations are persisted in the workspace DB and mirrored into
                `.cc/workspace/opencode.jsonc`.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
              {mcpServers.length} server{mcpServers.length === 1 ? "" : "s"}
            </div>
          </div>

          {mcpServers.length > 0 ? (
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
          ) : (
            <div className="mt-5">
              <EmptyState
                description="Add an external MCP server to register it globally for this workspace."
                title="No MCP servers configured yet"
              />
            </div>
          )}
        </section>
      ) : null}

      <section className="cc-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary">Composio</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Composio shortcuts and built-in setup flows will be added in I5. This slice focuses on
          generic external MCP lifecycle management.
        </p>
      </section>

      {dialog ? (
        <McpServerDialog
          busy={mcpMutations.create.isPending || mcpMutations.update.isPending}
          initialServer={dialog.mode === "edit" ? dialog.server : undefined}
          mode={dialog.mode}
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
          busy={mcpMutations.startAuth.isPending || mcpMutations.completeAuth.isPending}
          onClose={() => setAuthServer(undefined)}
          onSubmit={async (code) => {
            setSuccessMessage(undefined);
            const updated = await mcpMutations.completeAuth.mutateAsync({
              id: authServer.id,
              code,
            });
            setSuccessMessage(`${updated.name} authenticated.`);
          }}
          onStart={async () => mcpMutations.startAuth.mutateAsync({ id: authServer.id })}
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
  onStart: () => Promise<{ authorizationUrl: string }>;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [authorizationUrl, setAuthorizationUrl] = useState<string>();
  const [code, setCode] = useState("");
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
              Start the OAuth flow in your browser, then paste the returned callback code here.
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
            onClick={() => void handleStart()}
            type="button"
          >
            {props.busy ? "Starting..." : "Start OAuth"}
          </button>

          {authorizationUrl ? (
            <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-primary">
              <p className="font-medium">Authorization URL</p>
              <a
                className="mt-2 block break-all text-accent hover:underline"
                href={authorizationUrl}
                rel="noreferrer"
                target="_blank"
              >
                {authorizationUrl}
              </a>
            </div>
          ) : null}

          <Field label="Callback code" required>
            <input
              aria-label="Callback code"
              className="cc-input"
              onChange={(event) => setCode(event.target.value)}
              placeholder="Paste the OAuth callback code"
              value={code}
            />
          </Field>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
              Cancel
            </button>
            <button
              className="cc-button"
              disabled={props.busy || code.trim().length === 0}
              onClick={() => void handleSubmit()}
              type="button"
            >
              {props.busy ? "Completing..." : "Complete auth"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  async function handleStart() {
    setError(undefined);

    try {
      const result = await props.onStart();
      setAuthorizationUrl(result.authorizationUrl);
      window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      setError(readError(nextError));
    }
  }

  async function handleSubmit() {
    setError(undefined);

    try {
      await props.onSubmit(code.trim());
      props.onClose();
    } catch (nextError) {
      setError(readError(nextError));
    }
  }
}

function McpServerDialog(props: {
  mode: "create" | "edit";
  initialServer?: McpServer;
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
    () => createForm(props.initialServer),
    [props.initialServer],
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
                  placeholder="NODE_ENV=test\nAPI_TOKEN=secret"
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
                  placeholder="Authorization: Bearer token\nX-API-Key: value"
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
