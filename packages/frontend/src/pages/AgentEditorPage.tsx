import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type {
  Agent,
  AgentCatalog,
  AgentCapabilitySelection,
  CreateAgentInput,
  CustomToolAgentCopy,
  CustomToolDriftStatus,
  McpServer,
  UpdateAgentInput,
} from "@cc/shared/schemas";

import { AgentAvatarPicker } from "@/components/agents/AgentAvatarPicker";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useAgentCustomToolsQuery, useCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import {
  useAgentCatalogQuery,
  useAgentMutations,
  useAgentQuery,
  useAgentsQuery,
} from "@/hooks/use-agents-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import {
  getAppMcpServerAction,
  getMcpServerAction,
  setAppMcpServerAction,
  setMcpServerAction,
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

type PermissionAction = "allow" | "ask" | "deny";

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
  const customToolsQuery = useCustomToolsQuery();
  const agentCustomToolsQuery = useAgentCustomToolsQuery(agent?.id);
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
              <Field label="Avatar" error={undefined}>
                <AgentAvatarPicker
                  name={form.name}
                  onChange={(value) => updateField("iconPath", value)}
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
                <h2 className="text-lg font-semibold text-text-primary">Skills</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Assigned skills are copied into the agent workspace when the form is saved.
                </p>
              </div>
              <Link className="cc-button cc-button-secondary" to="/skills">
                Browse skills
              </Link>
            </div>

            {(catalog?.builtInSkills.length ?? 0) > 0 ||
            (catalog?.workspaceSkills?.length ?? 0) > 0 ? (
              <div className="mt-5 grid gap-6">
                {(catalog?.builtInSkills.length ?? 0) > 0 ? (
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">Built-in</h3>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                        Curated
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {catalog?.builtInSkills.map((skill) => {
                        const selected = (form.capabilities.builtInSkills ?? []).includes(
                          skill.slug,
                        );

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
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-text-primary">{skill.name}</p>
                                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                                    Built-in
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">
                                  {skill.description}
                                </p>
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
                  </div>
                ) : null}

                {(catalog?.workspaceSkills?.length ?? 0) > 0 ? (
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">Workspace</h3>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                        Portable
                      </span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {(catalog?.workspaceSkills ?? []).map((skill) => {
                        const selected = (form.capabilities.workspaceSkills ?? []).includes(
                          skill.slug,
                        );

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
                                onChange={() => toggleWorkspaceSkill(skill.slug)}
                                type="checkbox"
                              />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-text-primary">{skill.name}</p>
                                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                                    Workspace
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-text-secondary">
                                  {skill.description}
                                </p>
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
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState
                description="Create a workspace skill or use a built-in skill to extend this agent."
                title="No skills available"
              />
            )}
          </section>

          <section className="cc-panel p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Custom tools</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Selected global tools are copied into the agent workspace as snapshots. Existing
                  local copies can drift from the global library.
                </p>
              </div>
              <Link className="cc-button cc-button-secondary" to="/tools">
                Open tools library
              </Link>
            </div>

            {customToolsQuery.isLoading ? (
              <div className="mt-5">
                <LoadingState />
              </div>
            ) : customToolsQuery.error ? (
              <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {readError(customToolsQuery.error)}
              </div>
            ) : (customToolsQuery.data?.length ?? 0) > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {customToolsQuery.data?.map((tool) => {
                  const selected = (form.capabilities.customTools ?? []).includes(tool.slug);

                  return (
                    <label
                      className={
                        selected
                          ? "rounded-xl border border-accent/30 bg-accent/5 p-4"
                          : "rounded-xl border border-border bg-surface p-4"
                      }
                      key={tool.slug}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          checked={selected}
                          onChange={() => toggleCustomTool(tool.slug)}
                          type="checkbox"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-text-primary">{tool.name}</p>
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                              {tool.slug}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-text-secondary">
                            {tool.description || "No description yet."}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  description="Create a global tool before assigning it to an agent."
                  title="No custom tools available"
                />
              </div>
            )}

            {props.mode === "edit" ? (
              <div className="mt-6 grid gap-3 border-t border-border pt-6">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">
                    Current agent-local tools
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    These are the actual tools currently present in the workspace, including
                    modified or manual copies.
                  </p>
                </div>
                {agentCustomToolsQuery.isLoading ? <LoadingState /> : null}
                {agentCustomToolsQuery.error ? (
                  <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                    {readError(agentCustomToolsQuery.error)}
                  </div>
                ) : null}
                {!agentCustomToolsQuery.isLoading &&
                !agentCustomToolsQuery.error &&
                agentCustomToolsQuery.data?.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {agentCustomToolsQuery.data.map((tool) => (
                      <article
                        className="rounded-xl border border-border bg-app-bg p-4"
                        key={tool.slug}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-text-primary">{tool.name}</p>
                          <StatusBadge status={tool.status} />
                        </div>
                        <p className="mt-2 text-sm text-text-secondary">
                          {tool.description || "No description available."}
                        </p>
                        {!tool.isManaged ? (
                          <p className="mt-2 text-xs text-text-secondary">
                            This tool is not CC-managed and will not be removed automatically.
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="cc-panel p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">CommandsCenter tools</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Enable CC-managed MCP groups per agent. These are internal app capabilities, not
                  external integrations.
                </p>
              </div>
            </div>

            {(catalog?.appMcpServers.length ?? 0) > 0 ? (
              <div className="mt-5 grid gap-4">
                {catalog?.appMcpServers.map((server) => (
                  <article
                    className="rounded-xl border border-border bg-surface p-4"
                    key={server.name}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-text-primary">
                            {server.name}
                          </h3>
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                            CC-managed
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-text-secondary">{server.description}</p>
                      </div>

                      <McpServerPermissionControl
                        label={server.name}
                        onChange={(action) => setAppMcpServerPermission(server.name, action)}
                        value={getAppMcpServerAction(form.capabilities, server.name)}
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  description="No CommandsCenter-managed MCP groups are registered in this build."
                  title="No CC-managed tools available"
                />
              </div>
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
                          {server.runtimeStatus?.status === "failed" ||
                          server.runtimeStatus?.status === "needs_client_registration" ? (
                            <p className="mt-2 text-sm text-danger">{server.runtimeStatus.error}</p>
                          ) : null}
                        </div>

                        <McpServerPermissionControl
                          label={server.name}
                          onChange={(action) => setMcpServerPermission(server.name, action)}
                          value={getMcpServerAction(form.capabilities, server.name)}
                        />
                      </div>
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
        builtInSkills: (current.capabilities.builtInSkills ?? []).includes(skillSlug)
          ? (current.capabilities.builtInSkills ?? []).filter((value) => value !== skillSlug)
          : [...(current.capabilities.builtInSkills ?? []), skillSlug],
      },
    }));
  }

  function toggleWorkspaceSkill(skillSlug: string) {
    setForm((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        workspaceSkills: (current.capabilities.workspaceSkills ?? []).includes(skillSlug)
          ? (current.capabilities.workspaceSkills ?? []).filter((value) => value !== skillSlug)
          : [...(current.capabilities.workspaceSkills ?? []), skillSlug],
      },
    }));
  }

  function toggleCustomTool(toolSlug: string) {
    setForm((current) => ({
      ...current,
      capabilities: {
        ...current.capabilities,
        customTools: (current.capabilities.customTools ?? []).includes(toolSlug)
          ? (current.capabilities.customTools ?? []).filter((value) => value !== toolSlug)
          : [...(current.capabilities.customTools ?? []), toolSlug],
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

    const overwriteSlugs = resolveCustomToolOverwriteSlugs(
      form.capabilities.customTools ?? [],
      agentCustomToolsQuery.data ?? [],
    );

    if (overwriteSlugs === undefined) {
      return;
    }

    const payload: UpdateAgentInput = {
      name: form.name.trim(),
      role: form.role.trim(),
      instructions: form.instructions.trim(),
      defaultModel: form.defaultModel.trim(),
      iconPath: form.iconPath.trim() || undefined,
      customToolOverwriteSlugs: overwriteSlugs,
      capabilities: form.capabilities,
    };

    try {
      if (props.mode === "create") {
        const created = await agentMutations.create.mutateAsync(payload as CreateAgentInput);
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

  function setMcpServerPermission(serverName: string, action: PermissionAction) {
    setForm((current) => ({
      ...current,
      capabilities: setMcpServerAction(current.capabilities, serverName, action),
    }));
    setSaveError(undefined);
  }

  function setAppMcpServerPermission(serverName: string, action: PermissionAction) {
    setForm((current) => ({
      ...current,
      capabilities: setAppMcpServerAction(current.capabilities, serverName, action),
    }));
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
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
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
      workspaceSkills: existingCapabilities.workspaceSkills ?? [],
      customTools: existingCapabilities.customTools,
      mcpServers: existingCapabilities.mcpServers,
      toolPermissions: existingCapabilities.toolPermissions,
      appMcpServers: existingCapabilities.appMcpServers ?? [],
      appToolPermissions: existingCapabilities.appToolPermissions ?? [],
    },
  };
}

function McpServerPermissionControl(props: {
  label: string;
  value: PermissionAction;
  onChange: (action: PermissionAction) => void;
}) {
  const options = [
    {
      value: "deny" as const,
      label: "Disabled",
      selectedClassName: "border-rose-500 bg-rose-500/10 text-rose-600",
    },
    {
      value: "ask" as const,
      label: "Ask",
      selectedClassName: "border-amber-500 bg-amber-500/10 text-amber-600",
    },
    {
      value: "allow" as const,
      label: "Allow",
      selectedClassName: "border-emerald-500 bg-emerald-500/10 text-emerald-600",
    },
  ];

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {options.map((option) => {
        const selected = props.value === option.value;

        return (
          <button
            aria-label={`${props.label} ${option.label}`}
            aria-pressed={selected}
            className={
              selected
                ? `rounded-lg border px-3 py-1.5 text-xs font-medium transition ${option.selectedClassName}`
                : "rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            }
            key={option.value}
            onClick={() => props.onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

function StatusBadge(props: { status: CustomToolDriftStatus }) {
  const label = {
    global_only: "Global only",
    agent_only: "Agent only",
    matching: "Matching",
    outdated: "Outdated",
    modified: "Modified",
    unknown: "Unknown",
  }[props.status];
  const className = {
    global_only: "rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary",
    agent_only: "rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary",
    matching:
      "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300",
    outdated:
      "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300",
    modified:
      "rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-700 dark:text-rose-300",
    unknown: "rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary",
  }[props.status];

  return <span className={className}>{label}</span>;
}

function resolveCustomToolOverwriteSlugs(
  selectedSlugs: string[],
  agentTools: CustomToolAgentCopy[],
): string[] | undefined {
  const collisions = agentTools.filter(
    (tool) =>
      selectedSlugs.includes(tool.slug) && (!tool.isManaged || tool.sourceToolSlug !== tool.slug),
  );

  if (collisions.length === 0) {
    return [];
  }

  const confirmed = window.confirm(
    `The agent already has local tool copies for: ${collisions.map((tool) => tool.slug).join(", ")}. Overwrite them with the selected global versions?`,
  );

  return confirmed ? collisions.map((tool) => tool.slug) : undefined;
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
