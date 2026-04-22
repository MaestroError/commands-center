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
  transport: "streamable-http" | "sse";
  authMethod: "none" | "oauth" | "headers";
  headersText: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export function IntegrationsPage() {
  const mcpServersQuery = useMcpServersQuery();
  const mcpMutations = useMcpServerMutations();
  const [dialog, setDialog] = useState<DialogState>();
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
                  onEdit={() => setDialog({ mode: "edit", server })}
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
            config: {
              url: string;
              transport: "streamable-http" | "sse";
              authMethod: "none" | "oauth" | "headers";
              headers: Array<{ key: string; value: string }>;
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
    </div>
  );
}

function McpServerCard(props: {
  server: McpServer;
  toggling: boolean;
  onToggleEnabled: () => Promise<void>;
  onEdit: () => void;
  onRemove: () => Promise<void>;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{props.server.name}</h3>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-secondary">
            {props.server.config.transport}
          </p>
        </div>
        <span
          className={
            props.server.enabled ? "cc-badge cc-badge-connected" : "cc-badge cc-badge-muted"
          }
        >
          {props.server.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-surface-elevated/70 p-3">
          <dt className="text-text-secondary">Auth</dt>
          <dd className="mt-1 font-medium text-text-primary">{props.server.config.authMethod}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface-elevated/70 p-3">
          <dt className="text-text-secondary">Headers</dt>
          <dd className="mt-1 font-medium text-text-primary">
            {props.server.config.headers.length}
          </dd>
        </div>
      </dl>

      <p className="mt-4 break-all text-xs text-text-secondary">{props.server.config.url}</p>

      <div className="mt-5 flex flex-wrap gap-2">
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

function McpServerDialog(props: {
  mode: "create" | "edit";
  initialServer?: McpServer;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    enabled?: boolean;
    config: {
      url: string;
      transport: "streamable-http" | "sse";
      authMethod: "none" | "oauth" | "headers";
      headers: Array<{ key: string; value: string }>;
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
              </select>
            </Field>

            <Field error={errors.authMethod} label="Auth method" required>
              <select
                aria-label="Auth method"
                className="cc-input"
                onChange={(event) =>
                  updateField("authMethod", event.target.value as FormState["authMethod"])
                }
                value={form.authMethod}
              >
                <option value="none">none</option>
                <option value="oauth">oauth</option>
                <option value="headers">headers</option>
              </select>
            </Field>
          </div>

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
      const parsedHeaders = parseHeaders(form.headersText);
      const input = {
        name: form.name.trim(),
        ...(props.mode === "create" ? { enabled: true } : {}),
        config: {
          url: form.url.trim(),
          transport: form.transport,
          authMethod: form.authMethod,
          headers: parsedHeaders,
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

function createForm(server?: McpServer): FormState {
  return {
    name: server?.name ?? "",
    url: server?.config.url ?? "",
    transport: server?.config.transport ?? "streamable-http",
    authMethod: server?.config.authMethod ?? "none",
    headersText: (server?.config.headers ?? [])
      .map((header) => `${header.key}: ${header.value}`)
      .join("\n"),
  };
}

function validateForm(form: FormState): FormErrors {
  return {
    name: form.name.trim() ? undefined : "Name is required.",
    url: isValidUrl(form.url.trim()) ? undefined : "A valid URL is required.",
    transport: form.transport ? undefined : "Transport is required.",
    authMethod: form.authMethod ? undefined : "Auth method is required.",
    headersText: validateHeaders(form.headersText),
  };
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
