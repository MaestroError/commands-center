import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type {
  Agent,
  AgentCatalog,
  AgentCapabilitySelection,
  McpServer,
  UpdateAgentInput,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import {
  useAgentCatalogQuery,
  useAgentMutations,
  useAgentQuery,
  useAgentsQuery,
} from "@/hooks/use-agents-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import {
  getMcpServerSelection,
  setMcpServerEnabled,
  upsertMcpServerSelection,
} from "@/lib/agent-capabilities";
import { resolveInitialModelId } from "@/lib/agent-form";

type AgentEditorPageProps = {
  mode: "create" | "edit";
};

type AgentFormState = {
  name: string;
  role: string;
  instructions: string;
  iconPath: string;
  defaultModel: string;
  capabilities: AgentCapabilitySelection;
};

type FormErrors = Partial<
  Record<keyof Pick<AgentFormState, "name" | "role" | "instructions" | "defaultModel">, string>
>;

type PermissionAction = AgentCapabilitySelection["mcpServers"][number]["action"];

export function AgentEditorPage(props: AgentEditorPageProps) {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const catalogQuery = useAgentCatalogQuery();
  const agentsQuery = useAgentsQuery();
  const agentQuery = useAgentQuery(props.mode === "edit" ? params.slug : undefined);
  const mcpServersQuery = useMcpServersQuery();
  const agentMutations = useAgentMutations();
  const [form, setForm] = useState<AgentFormState>(createEmptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const [successMessage, setSuccessMessage] = useState<string>();
  const initializedKeyRef = useRef<string | undefined>(undefined);
  const catalog = catalogQuery.data;
  const agents = agentsQuery.data ?? [];
  const agent = agentQuery.data;
  const hasProviderModels = (catalog?.providerModels.length ?? 0) > 0;
  const slug = slugify(form.name);
  const slugTaken = agents.some((entry) => entry.slug === slug && entry.id !== agent?.id);

  useEffect(() => {
    if (!catalog) {
      return;
    }

    if (props.mode === "edit" && !agent) {
      return;
    }

    const nextKey = props.mode === "create" ? "create" : `${agent?.slug}:${agent?.updatedAt}`;

    if (initializedKeyRef.current === nextKey || !nextKey) {
      return;
    }

    initializedKeyRef.current = nextKey;
    setForm(createInitialForm(catalog, agent));
    setErrors({});
    setSaveError(undefined);
  }, [agent, catalog, props.mode]);

  const catalogError = catalogQuery.error ? readError(catalogQuery.error) : undefined;
  const agentError = agentQuery.error ? readError(agentQuery.error) : undefined;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          props.mode === "edit" && agent ? (
            <Link className="cc-button cc-button-secondary" to={`/chat/${agent.slug}`}>
              Open chat
            </Link>
          ) : undefined
        }
        description="Create a new agent or update an existing one using the same reusable workflow and workspace-backed configuration."
        eyebrow={props.mode === "create" ? "Create Agent" : "Edit Agent"}
        title={props.mode === "create" ? "Create agent" : (agent?.name ?? "Edit agent")}
      />

      {successMessage ? <section className="cc-success">{successMessage}</section> : null}
      {catalogError ? (
        <ErrorState description={catalogError} title="Agent catalog could not be loaded." />
      ) : null}
      {agentError ? (
        <ErrorState description={agentError} title="Agent details could not be loaded." />
      ) : null}
      {catalogQuery.isLoading || (props.mode === "edit" && agentQuery.isLoading) ? (
        <LoadingState />
      ) : null}

      {!catalogQuery.isLoading &&
      !catalogError &&
      props.mode === "edit" &&
      !agent &&
      !agentQuery.isLoading ? (
        <EmptyState
          description="The requested agent slug no longer exists."
          title="Agent not found"
        />
      ) : null}

      {!catalogQuery.isLoading && !catalogError && (props.mode === "create" || agent) ? (
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <section className="cc-panel grid gap-5 p-6 lg:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <div className="grid gap-2">
                <input
                  className="cc-input"
                  onChange={(event) => updateField("name", event.target.value)}
                  value={form.name}
                />
                <p className="text-xs text-text-secondary" data-testid="agent-slug-preview">
                  Identifier: <span className="font-medium text-text-primary">{slug}</span>
                </p>
              </div>
            </Field>
            <Field label="Role" required error={errors.role}>
              <input
                className="cc-input"
                onChange={(event) => updateField("role", event.target.value)}
                value={form.role}
              />
            </Field>
            <div className="lg:col-span-2">
              <Field label="Icon or image URL" error={undefined}>
                <input
                  className="cc-input"
                  onChange={(event) => updateField("iconPath", event.target.value)}
                  placeholder="Optional image URL"
                  value={form.iconPath}
                />
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Instructions" required error={errors.instructions}>
                <textarea
                  className="cc-input min-h-48 resize-y"
                  onChange={(event) => updateField("instructions", event.target.value)}
                  value={form.instructions}
                />
              </Field>
            </div>
          </section>

          <section className="cc-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Default model</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Only models from connected providers are selectable here.
                </p>
              </div>
              <Link className="cc-button cc-button-secondary" to="/providers">
                Manage providers
              </Link>
            </div>

            {hasProviderModels ? (
              <div className="mt-5">
                <Field label="Model" required error={errors.defaultModel}>
                  <select
                    className="cc-input"
                    onChange={(event) => updateField("defaultModel", event.target.value)}
                    value={form.defaultModel}
                  >
                    <option value="">Select a model</option>
                    {catalog?.providerModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : (
              <EmptyState
                description="Connect a provider before you can save an agent."
                title="No connected models available"
              />
            )}
          </section>

          <section className="cc-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Built-in skills</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Assigned skills are copied into the agent workspace when the form is saved.
                </p>
              </div>
              <Link className="cc-button cc-button-secondary" to="/skills">
                Browse skills
              </Link>
            </div>

            {(catalog?.builtInSkills.length ?? 0) > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {catalog?.builtInSkills.map((skill) => {
                  const selected = form.capabilities.builtInSkills.includes(skill.slug);

                  return (
                    <label
                      className={
                        selected
                          ? "rounded-xl border border-accent/30 bg-accent/5 p-4"
                          : "rounded-xl border border-border bg-surface p-4"
                      }
                      key={skill.slug}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          checked={selected}
                          onChange={() => toggleSkill(skill.slug)}
                          type="checkbox"
                        />
                        <div>
                          <p className="font-semibold text-text-primary">{skill.name}</p>
                          <p className="mt-1 text-sm text-text-secondary">{skill.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                            <span className="rounded-full border border-border px-2 py-1">
                              {skill.category}
                            </span>
                            {skill.version ? (
                              <span className="rounded-full border border-border px-2 py-1">
                                v{skill.version}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                description="No curated skills are available in this workspace yet."
                title="No built-in skills available"
              />
            )}
          </section>

          <section className="cc-panel p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">MCP permissions</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Enable global MCP servers per agent, then opt tools into allow, ask, or deny.
                </p>
              </div>
              <Link className="cc-button cc-button-secondary" to="/integrations">
                Manage integrations
              </Link>
            </div>

            {mcpServersQuery.isLoading ? (
              <div className="mt-5">
                <LoadingState />
              </div>
            ) : mcpServersQuery.error ? (
              <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {readError(mcpServersQuery.error)}
              </div>
            ) : mcpServersQuery.data && mcpServersQuery.data.length > 0 ? (
              <div className="mt-5 grid gap-4">
                {mcpServersQuery.data.map((server) => {
                  const serverSelection = getMcpServerSelection(form.capabilities, server.name);
                  const serverEnabled = serverSelection?.enabled ?? false;

                  return (
                    <article
                      className="rounded-xl border border-border bg-surface p-4"
                      key={server.id}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-text-primary">
                              {server.name}
                            </h3>
                            <span className={statusBadgeClassName(server)}>
                              {statusLabel(server)}
                            </span>
                            {!server.enabled ? (
                              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                                Globally disabled
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-text-secondary">
                            {server.tools.length} tool{server.tools.length === 1 ? "" : "s"}{" "}
                            discovered.
                          </p>
                          {server.runtimeStatus?.status === "failed" ||
                          server.runtimeStatus?.status === "needs_client_registration" ? (
                            <p className="mt-2 text-sm text-danger">{server.runtimeStatus.error}</p>
                          ) : null}
                        </div>

                        <label className="flex items-center gap-2 text-sm text-text-primary">
                          <input
                            checked={serverEnabled}
                            onChange={() => toggleMcpServer(server.name)}
                            type="checkbox"
                          />
                          <span>Enable for this agent</span>
                        </label>
                      </div>

                      {serverEnabled ? (
                        server.tools.length > 0 ? (
                          <div className="mt-5 grid gap-3">
                            {server.tools.map((tool) => (
                              <div
                                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-elevated p-3 md:flex-row md:items-center md:justify-between"
                                key={tool.id}
                              >
                                <div>
                                  <p className="font-medium text-text-primary">{tool.name}</p>
                                  <p className="text-xs text-text-secondary">{tool.id}</p>
                                </div>
                                <PermissionControl
                                  label={tool.id}
                                  onChange={(action) =>
                                    setToolPermission(server.name, tool.id, action)
                                  }
                                  value={getToolPermission(form.capabilities, server.name, tool.id)}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-text-secondary">
                            Tools are not available yet. Connect or authenticate this MCP in
                            Integrations before granting tool-level access.
                          </div>
                        )
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  description="Create a global MCP integration before assigning its tools to an agent."
                  title="No MCP integrations configured"
                />
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            {saveError ? <p className="w-full text-sm text-danger">{saveError}</p> : null}
            <button
              className="cc-button"
              disabled={
                agentMutations.create.isPending ||
                agentMutations.update.isPending ||
                !hasProviderModels
              }
              type="submit"
            >
              {agentMutations.create.isPending || agentMutations.update.isPending
                ? "Saving..."
                : props.mode === "create"
                  ? "Create agent"
                  : "Save changes"}
            </button>
            <Link className="cc-button cc-button-secondary" to="/agents">
              Back to agents
            </Link>
          </div>
        </form>
      ) : null}
    </div>
  );

  function updateField<Key extends keyof AgentFormState>(key: Key, value: AgentFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError(undefined);
  }

  function toggleSkill(skillSlug: string) {
    setForm((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        builtInSkills: current.capabilities.builtInSkills.includes(skillSlug)
          ? current.capabilities.builtInSkills.filter((value) => value !== skillSlug)
          : [...current.capabilities.builtInSkills, skillSlug],
      },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(undefined);
    setSaveError(undefined);
    const validation = validateForm(form, hasProviderModels, slugTaken);
    setErrors(validation);

    if (Object.values(validation).some(Boolean)) {
      return;
    }

    const payload: UpdateAgentInput = {
      name: form.name.trim(),
      role: form.role.trim(),
      instructions: form.instructions.trim(),
      defaultModel: form.defaultModel.trim(),
      iconPath: form.iconPath.trim() || undefined,
      capabilities: form.capabilities,
    };

    try {
      if (props.mode === "create") {
        const created = await agentMutations.create.mutateAsync(
          payload as AgentFormState & UpdateAgentInput,
        );
        void navigate(`/agents/${created.slug}/edit`, { replace: true });
        setSuccessMessage(`${created.name} created.`);
        return;
      }

      if (!agent) {
        return;
      }

      const updated = await agentMutations.update.mutateAsync({ id: agent.id, input: payload });
      void navigate(`/agents/${updated.slug}/edit`, { replace: true });
      setSuccessMessage(`${updated.name} saved.`);
    } catch (error) {
      setSaveError(readError(error));
    }
  }

  function toggleMcpServer(serverName: string) {
    setForm((current) => ({
      ...current,
      capabilities: setMcpServerEnabled(
        current.capabilities,
        serverName,
        !(getMcpServerSelection(current.capabilities, serverName)?.enabled ?? false),
      ),
    }));
    setSaveError(undefined);
  }

  function setToolPermission(serverName: string, toolId: string, action: PermissionAction) {
    setForm((current) => {
      const serverSelection = getMcpServerSelection(current.capabilities, serverName) ?? {
        name: serverName,
        enabled: true,
        action: "allow" as const,
      };
      const nextPermissions = current.capabilities.toolPermissions.filter(
        (rule) => rule.pattern !== toolId,
      );

      if (action !== serverSelection.action) {
        nextPermissions.push({ pattern: toolId, action });
      }

      return {
        ...current,
        capabilities: {
          ...current.capabilities,
          mcpServers: upsertMcpServerSelection(current.capabilities.mcpServers, serverSelection),
          toolPermissions: nextPermissions,
        },
      };
    });
    setSaveError(undefined);
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

function createEmptyForm(): AgentFormState {
  return {
    name: "",
    role: "",
    instructions: "",
    iconPath: "",
    defaultModel: "",
    capabilities: {
      builtInSkills: [],
      mcpServers: [],
      toolPermissions: [],
    },
  };
}

function createInitialForm(catalog: AgentCatalog, agent?: Agent): AgentFormState {
  const existingCapabilities = agent?.capabilities ?? createEmptyForm().capabilities;

  return {
    name: agent?.name ?? "",
    role: agent?.role ?? "",
    instructions: agent?.instructions ?? "",
    iconPath: agent?.iconPath ?? "",
    defaultModel: resolveInitialModelId(catalog, agent?.defaultModel),
    capabilities: {
      builtInSkills: existingCapabilities.builtInSkills,
      mcpServers: existingCapabilities.mcpServers,
      toolPermissions: existingCapabilities.toolPermissions,
    },
  };
}

function PermissionControl(props: {
  label: string;
  value: PermissionAction;
  onChange: (action: PermissionAction) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["allow", "ask", "deny"] as const).map((action) => {
        const selected = props.value === action;

        return (
          <button
            aria-label={`${props.label} ${action}`}
            aria-pressed={selected}
            className={
              selected
                ? "rounded-full border border-accent bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition hover:border-accent hover:text-text-primary"
            }
            key={action}
            onClick={() => props.onChange(action)}
            type="button"
          >
            {action}
          </button>
        );
      })}
    </div>
  );
}

function getToolPermission(
  capabilities: AgentCapabilitySelection,
  serverName: string,
  toolId: string,
): PermissionAction {
  return (
    capabilities.toolPermissions.find((rule) => rule.pattern === toolId)?.action ??
    getMcpServerSelection(capabilities, serverName)?.action ??
    "allow"
  );
}

function statusLabel(server: McpServer): string {
  switch (server.runtimeStatus?.status) {
    case "connected":
      return "Connected";
    case "needs_auth":
      return "Needs auth";
    case "failed":
      return "Failed";
    case "needs_client_registration":
      return "Needs client registration";
    case "disabled":
      return "Disabled";
    case "disconnected":
    default:
      return server.enabled ? "Disconnected" : "Disabled";
  }
}

function statusBadgeClassName(server: McpServer): string {
  switch (server.runtimeStatus?.status) {
    case "connected":
      return "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400";
    case "needs_auth":
      return "rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400";
    case "failed":
    case "needs_client_registration":
      return "rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger";
    case "disabled":
    case "disconnected":
    default:
      return "rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-medium text-text-secondary";
  }
}

function validateForm(
  form: AgentFormState,
  hasProviderModels: boolean,
  slugTaken: boolean,
): FormErrors {
  return {
    name: !form.name.trim()
      ? "Name is required."
      : slugTaken
        ? `Identifier '${slugify(form.name)}' is already in use.`
        : undefined,
    role: form.role.trim() ? undefined : "Role is required.",
    instructions: form.instructions.trim() ? undefined : "Instructions are required.",
    defaultModel:
      hasProviderModels && form.defaultModel.trim() ? undefined : "A default model is required.",
  };
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "agent";
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Agent editor could not be loaded.";
}
