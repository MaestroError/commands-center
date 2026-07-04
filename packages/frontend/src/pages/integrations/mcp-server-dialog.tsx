// Split out of IntegrationsPage.tsx (issue #99).

import { getMcpServerSelection } from "@/lib/specialist-capabilities";
import type { McpServer, Specialist } from "@cc/shared/schemas";
import { useMemo, useRef, useState } from "react";
import {
  type FormErrors,
  type FormState,
  createForm,
  extractEnvRefs,
  parseCommand,
  parseEnvironment,
  parseHeaders,
  readError,
  validateForm,
} from "./integration-helpers";
import { ChevronIcon, CloseIcon } from "./integration-icons";

export function McpServerDialog(props: {
  agents: Specialist[];
  mode: "create" | "edit";
  initialServer?: McpServer;
  prefill?: FormState;
  existingNames: string[];
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
  // Names already taken by other servers — Opencode requires unique MCP names.
  // When editing, only the server's own exact current name stays allowed; other
  // case variants remain reserved so the case-insensitive check can catch them.
  const reservedNames = useMemo(
    () => props.existingNames.filter((name) => name !== props.initialServer?.name),
    [props.existingNames, props.initialServer],
  );

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
    const validation = validateForm(form, reservedNames);
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

export function Field(props: {
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
