import { useState } from "react";
import { Link } from "react-router-dom";

import { Switch } from "@/components/common/Switch";
import { SpecialistAvatarPicker } from "@/components/specialists/SpecialistAvatarPicker";
import { EmptyState, LoadingState } from "@/components/common/PageStates";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { useSpecialistCustomToolsQuery, useCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import { useSpecialistCatalogQuery, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useMcpServersQuery } from "@/hooks/use-mcp-servers-query";
import {
  getAppMcpServerAction,
  getAppMcpToolAction,
  getMcpServerAction,
  setAppMcpServerAction,
  setAppMcpToolEnabled,
  setMcpServerAction,
} from "@/lib/specialist-capabilities";
import {
  specialistFormSlug,
  type SpecialistFormErrors,
  type SpecialistFormState,
} from "@/lib/specialist-form";

import type {
  SpecialistCatalog,
  SpecialistCapabilitySelection,
  SpecialistMcpOverride,
  AppMcpToolContext,
  BuiltInSkill,
  CustomTool,
  CustomToolDriftStatus,
  McpServer,
  WorkspaceSkill,
} from "@cc/shared/schemas";

type PermissionAction = "allow" | "ask" | "deny";

type SkillOption =
  | { kind: "built-in"; skill: BuiltInSkill }
  | { kind: "workspace"; skill: WorkspaceSkill };

type SpecialistFormProps = {
  mode: "create" | "edit";
  value: SpecialistFormState;
  onChange: (next: SpecialistFormState) => void;
  errors?: SpecialistFormErrors;
  /** Edit/draft-update: specialist id used to show the current specialist-local tool drift. */
  agentId?: string;
  /** Single-column layout for narrow containers such as the review pane. */
  dense?: boolean;
};

/**
 * Self-contained specialist form used by both the specialist editor page and the draft-specialist
 * review surface. It owns its own catalog/skill/tool/MCP data fetching and renders
 * every field (basics, model, skills, custom tools, CC-managed tools, MCP permissions).
 * It does not render a submit control or perform any save — the parent owns submission.
 */
export function SpecialistForm(props: SpecialistFormProps) {
  const { value, onChange, mode } = props;
  const errors = props.errors ?? {};

  const catalogQuery = useSpecialistCatalogQuery();
  const agentsQuery = useSpecialistsQuery();
  const mcpServersQuery = useMcpServersQuery();
  const customToolsQuery = useCustomToolsQuery();
  const specialistCustomToolsQuery = useSpecialistCustomToolsQuery(props.agentId);

  const [skillSearch, setSkillSearch] = useState("");
  const [customToolSearch, setCustomToolSearch] = useState("");

  const catalog = catalogQuery.data;
  const agents = agentsQuery.data ?? [];
  const hasProviderModels = (catalog?.providerModels.length ?? 0) > 0;
  const slug = specialistFormSlug(value.name);
  const slugTaken = agents.some((entry) => entry.slug === slug && entry.id !== props.agentId);
  const skillOptions = buildSkillOptions(catalog);
  const selectedSkills = skillOptions.filter((option) =>
    isSkillSelected(value.capabilities, option),
  );
  const skillSearchResults = filterSkillOptions(skillOptions, value.capabilities, skillSearch);
  const selectedCustomTools = (customToolsQuery.data ?? []).filter((tool) =>
    (value.capabilities.customTools ?? []).includes(tool.slug),
  );
  const customToolSearchResults = filterCustomTools(
    customToolsQuery.data ?? [],
    value.capabilities,
    customToolSearch,
  );

  function update<Key extends keyof SpecialistFormState>(key: Key, next: SpecialistFormState[Key]) {
    onChange({ ...value, [key]: next });
  }

  function updateCapabilities(next: SpecialistCapabilitySelection) {
    onChange({ ...value, capabilities: next });
  }

  function addSkillOption(option: SkillOption) {
    updateCapabilities({
      ...value.capabilities,
      builtInSkills:
        option.kind === "built-in"
          ? addUnique(value.capabilities.builtInSkills ?? [], option.skill.slug)
          : (value.capabilities.builtInSkills ?? []),
      workspaceSkills:
        option.kind === "workspace"
          ? addUnique(value.capabilities.workspaceSkills ?? [], option.skill.slug)
          : (value.capabilities.workspaceSkills ?? []),
    });
    setSkillSearch("");
  }

  function removeSkillOption(option: SkillOption) {
    updateCapabilities({
      ...value.capabilities,
      builtInSkills:
        option.kind === "built-in"
          ? (value.capabilities.builtInSkills ?? []).filter((entry) => entry !== option.skill.slug)
          : (value.capabilities.builtInSkills ?? []),
      workspaceSkills:
        option.kind === "workspace"
          ? (value.capabilities.workspaceSkills ?? []).filter(
              (entry) => entry !== option.skill.slug,
            )
          : (value.capabilities.workspaceSkills ?? []),
    });
  }

  function toggleCustomTool(toolSlug: string) {
    updateCapabilities({
      ...value.capabilities,
      customTools: (value.capabilities.customTools ?? []).includes(toolSlug)
        ? (value.capabilities.customTools ?? []).filter((entry) => entry !== toolSlug)
        : [...(value.capabilities.customTools ?? []), toolSlug],
    });
  }

  function setMcpServerPermission(serverName: string, action: SpecialistMcpOverride) {
    updateCapabilities(setMcpServerAction(value.capabilities, serverName, action));
  }

  function setAppMcpServerPermission(serverName: string, action: PermissionAction) {
    updateCapabilities(setAppMcpServerAction(value.capabilities, serverName, action));
  }

  function setAppMcpToolPermission(serverName: string, toolName: string, enabled: boolean) {
    updateCapabilities(setAppMcpToolEnabled(value.capabilities, serverName, toolName, enabled));
  }

  const dense = props.dense ?? false;

  return (
    <div className="grid gap-4">
      <section
        className={dense ? "cc-panel grid gap-5 p-6" : "cc-panel grid gap-5 p-6 lg:grid-cols-2"}
      >
        <Field error={errors.name} label="Name" required>
          <div className="grid gap-2">
            <input
              className="cc-input"
              onChange={(event) => update("name", event.target.value)}
              value={value.name}
            />
            <p className="text-xs text-text-secondary" data-testid="specialist-slug-preview">
              Identifier: <span className="font-medium text-text-primary">{slug}</span>
              {slugTaken ? <span className="ml-1 text-danger">(already in use)</span> : null}
            </p>
          </div>
        </Field>
        <Field error={errors.role} label="Role" required>
          <input
            className="cc-input"
            onChange={(event) => update("role", event.target.value)}
            value={value.role}
          />
        </Field>
        <div className="lg:col-span-2">
          <Field error={undefined} label="Avatar">
            <SpecialistAvatarPicker
              dense={dense}
              name={value.name}
              onChange={(next) => update("iconPath", next)}
              value={value.iconPath}
            />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Field error={errors.instructions} label="Instructions" required>
            <textarea
              className="cc-input min-h-48 resize-y"
              onChange={(event) => update("instructions", event.target.value)}
              value={value.instructions}
            />
          </Field>
        </div>
        {mode === "edit" ? (
          <div className="lg:col-span-2">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border-subtle p-4">
              <div>
                <p className="font-medium text-text-primary">Rewrite AGENTS.md</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Off by default. When on, saving regenerates the specialist&apos;s AGENTS.md from
                  the role and instructions above, overwriting any manual edits.
                </p>
              </div>
              <Switch
                aria-label="Rewrite AGENTS.md on save"
                checked={value.rewriteAgentsMd}
                onChange={(checked) => update("rewriteAgentsMd", checked)}
              />
            </div>
          </div>
        ) : null}
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
            <Field error={errors.defaultModel} label="Model" required>
              <SearchableSelect
                ariaLabel="Model"
                onChange={(next) => update("defaultModel", next)}
                options={catalog?.providerModels ?? []}
                placeholder="Search models..."
                value={value.defaultModel}
              />
            </Field>
          </div>
        ) : (
          <EmptyState
            description="Connect a provider before you can save a specialist."
            title="No connected models available"
          />
        )}
      </section>

      <CollapsibleSection
        action={
          <Link className="cc-button cc-button-secondary" to="/skills">
            Browse skills
          </Link>
        }
        description="Assigned skills are copied into the specialist workspace when the form is saved."
        title="Skills"
      >
        {skillOptions.length > 0 ? (
          <div className="grid gap-5">
            <div className="grid gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Chosen skills</h3>
              {selectedSkills.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedSkills.map((option) => (
                    <SkillCard
                      key={`${option.kind}:${option.skill.slug}`}
                      onClick={() => removeSkillOption(option)}
                      option={option}
                      selected
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">
                  No skills chosen yet. Search below to add one.
                </p>
              )}
            </div>

            <div className="grid gap-3 border-t border-border pt-5">
              <Field error={undefined} label="Search skills">
                <input
                  className="cc-input"
                  onChange={(event) => setSkillSearch(event.target.value)}
                  placeholder="Search built-in and workspace skills"
                  value={skillSearch}
                />
              </Field>
              {skillSearch.trim() ? (
                skillSearchResults.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {skillSearchResults.map((option) => (
                      <SkillCard
                        key={`${option.kind}:${option.skill.slug}`}
                        onClick={() => addSkillOption(option)}
                        option={option}
                        selected={false}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">No matching unassigned skills.</p>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            description="Create a workspace skill or use a built-in skill to extend this specialist."
            title="No skills available"
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection
        action={
          <Link className="cc-button cc-button-secondary" to="/tools">
            Open tools library
          </Link>
        }
        description="Selected global tools are copied into the specialist workspace as snapshots. Existing local copies can drift from the global library."
        title="Custom tools"
      >
        {customToolsQuery.isLoading ? (
          <div>
            <LoadingState />
          </div>
        ) : customToolsQuery.error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {readError(customToolsQuery.error)}
          </div>
        ) : (customToolsQuery.data?.length ?? 0) > 0 ? (
          <div className="grid gap-5">
            <div className="grid gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Chosen global tools</h3>
              {selectedCustomTools.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {selectedCustomTools.map((tool) => (
                    <CustomToolCard
                      key={tool.slug}
                      onClick={() => toggleCustomTool(tool.slug)}
                      selected
                      tool={tool}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">
                  No global tools chosen yet. Search below to add one.
                </p>
              )}
            </div>

            <div className="grid gap-3 border-t border-border pt-5">
              <Field error={undefined} label="Search global tools">
                <input
                  className="cc-input"
                  onChange={(event) => setCustomToolSearch(event.target.value)}
                  placeholder="Search tools by name, slug, or description"
                  value={customToolSearch}
                />
              </Field>
              {customToolSearch.trim() ? (
                customToolSearchResults.length > 0 ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {customToolSearchResults.map((tool) => (
                      <CustomToolCard
                        key={tool.slug}
                        onClick={() => toggleCustomTool(tool.slug)}
                        selected={false}
                        tool={tool}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">No matching unassigned tools.</p>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <EmptyState
              description="Create a global tool before assigning it to a specialist."
              title="No custom tools available"
            />
          </div>
        )}

        {mode === "edit" ? (
          <div className="mt-6 grid gap-3 border-t border-border pt-6">
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Current specialist-local tools
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                These are the actual tools currently present in the workspace, including modified or
                manual copies.
              </p>
            </div>
            {specialistCustomToolsQuery.isLoading ? <LoadingState /> : null}
            {specialistCustomToolsQuery.error ? (
              <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {readError(specialistCustomToolsQuery.error)}
              </div>
            ) : null}
            {!specialistCustomToolsQuery.isLoading &&
            !specialistCustomToolsQuery.error &&
            specialistCustomToolsQuery.data?.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {specialistCustomToolsQuery.data.map((tool) => (
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
      </CollapsibleSection>

      <CollapsibleSection
        description="Enable CC-managed MCP groups per specialist. These are internal app capabilities, not external integrations."
        title="CommandsCenter tools"
      >
        {(catalog?.appMcpServers.length ?? 0) > 0 ? (
          <div className="grid gap-4">
            {catalog?.appMcpServers.map((server) => {
              const serverAction = getAppMcpServerAction(value.capabilities, server.name);

              return (
                <article
                  className="rounded-xl border border-border bg-surface p-4"
                  key={server.name}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">{server.name}</h3>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                          CC-managed
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">{server.description}</p>
                    </div>

                    <AppMcpServerPermissionControl
                      label={server.name}
                      onChange={(action) => setAppMcpServerPermission(server.name, action)}
                      value={serverAction}
                    />
                  </div>

                  {serverAction !== "deny" && server.tools.length > 0 ? (
                    <div className="mt-4 grid gap-3">
                      {server.tools.map((tool) => {
                        const toolEnabled =
                          getAppMcpToolAction(value.capabilities, server.name, tool.name) ===
                          "allow";

                        return (
                          <div
                            className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3 md:flex-row md:items-start md:justify-between"
                            key={tool.name}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-text-primary">{tool.name}</p>
                                <ToolContextBadge context={tool.context} />
                              </div>
                              <p className="mt-1 text-sm text-text-secondary">{tool.description}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Switch
                                aria-label={`${server.name} ${tool.name}`}
                                checked={toolEnabled}
                                onChange={(enabled) =>
                                  setAppMcpToolPermission(server.name, tool.name, enabled)
                                }
                              />
                              <span className="text-xs text-text-secondary">
                                {toolEnabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div>
            <EmptyState
              description="No CommandsCenter-managed MCP groups are registered in this build."
              title="No CC-managed tools available"
            />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        action={
          <Link className="cc-button cc-button-secondary" to="/integrations">
            Manage integrations
          </Link>
        }
        description="Enable global MCP servers per specialist, then opt tools into allow, ask, or deny."
        title="MCP permissions"
      >
        {mcpServersQuery.isLoading ? (
          <div>
            <LoadingState />
          </div>
        ) : mcpServersQuery.error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {readError(mcpServersQuery.error)}
          </div>
        ) : mcpServersQuery.data && mcpServersQuery.data.length > 0 ? (
          <div className="grid gap-4">
            {mcpServersQuery.data.map((server) => (
              <article className="rounded-xl border border-border bg-surface p-4" key={server.id}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-text-primary">{server.name}</h3>
                      <span className={statusBadgeClassName(server)}>{statusLabel(server)}</span>
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
                    value={getMcpServerAction(value.capabilities, server.name)}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div>
            <EmptyState
              description="Create a global MCP integration before assigning its tools to a specialist."
              title="No MCP integrations configured"
            />
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
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

function CollapsibleSection(props: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section className="cc-panel p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-sm text-text-secondary">
            {open ? "-" : "+"}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-text-primary">{props.title}</span>
            <span className="mt-1 block text-sm text-text-secondary">{props.description}</span>
          </span>
        </button>
        {props.action ? <div className="shrink-0">{props.action}</div> : null}
      </div>

      {open ? <div className="mt-5">{props.children}</div> : null}
    </section>
  );
}

function SkillCard(props: { option: SkillOption; selected: boolean; onClick: () => void }) {
  const { option } = props;
  const label = option.kind === "built-in" ? "Built-in" : "Workspace";

  return (
    <button
      className={
        props.selected
          ? "rounded-xl border border-accent/30 bg-accent/5 p-4 text-left"
          : "rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/40"
      }
      onClick={props.onClick}
      type="button"
    >
      <div className="flex items-start gap-3">
        <input checked={props.selected} readOnly type="checkbox" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-text-primary">{option.skill.name}</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
              {label}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{option.skill.description}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
            <span className="rounded-full border border-border px-2 py-1">
              {option.skill.category}
            </span>
            {option.skill.version ? (
              <span className="rounded-full border border-border px-2 py-1">
                v{option.skill.version}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function CustomToolCard(props: { tool: CustomTool; selected: boolean; onClick: () => void }) {
  return (
    <button
      className={
        props.selected
          ? "rounded-xl border border-accent/30 bg-accent/5 p-4 text-left"
          : "rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/40"
      }
      onClick={props.onClick}
      type="button"
    >
      <div className="flex items-start gap-3">
        <input checked={props.selected} readOnly type="checkbox" />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-text-primary">{props.tool.name}</p>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
              {props.tool.slug}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {props.tool.description || "No description yet."}
          </p>
        </div>
      </div>
    </button>
  );
}

function McpServerPermissionControl(props: {
  label: string;
  value: SpecialistMcpOverride;
  onChange: (action: SpecialistMcpOverride) => void;
}) {
  const options = [
    {
      value: "none" as const,
      label: "None",
      selectedClassName: "border-border bg-surface-elevated text-text-primary",
    },
    {
      value: "disabled" as const,
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

function AppMcpServerPermissionControl(props: {
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

function StatusBadge(props: { status: CustomToolDriftStatus }) {
  const label = {
    global_only: "Global only",
    agent_only: "Specialist only",
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

function ToolContextBadge(props: { context: AppMcpToolContext }) {
  const label = {
    chat: "Chat",
    task_run: "Task run",
    both: "Chat + task",
  }[props.context];

  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary">
      {label}
    </span>
  );
}

function buildSkillOptions(catalog: SpecialistCatalog | undefined): SkillOption[] {
  return [
    ...(catalog?.builtInSkills ?? []).map((skill) => ({ kind: "built-in" as const, skill })),
    ...(catalog?.workspaceSkills ?? []).map((skill) => ({ kind: "workspace" as const, skill })),
  ];
}

function isSkillSelected(
  capabilities: SpecialistCapabilitySelection,
  option: SkillOption,
): boolean {
  if (option.kind === "built-in") {
    return (capabilities.builtInSkills ?? []).includes(option.skill.slug);
  }

  return (capabilities.workspaceSkills ?? []).includes(option.skill.slug);
}

function filterSkillOptions(
  options: SkillOption[],
  capabilities: SpecialistCapabilitySelection,
  query: string,
): SkillOption[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return options.filter(
    (option) =>
      !isSkillSelected(capabilities, option) &&
      [option.skill.name, option.skill.slug, option.skill.description, option.skill.category]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
  );
}

function filterCustomTools(
  tools: CustomTool[],
  capabilities: SpecialistCapabilitySelection,
  query: string,
): CustomTool[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [];
  }

  return tools.filter(
    (tool) =>
      !(capabilities.customTools ?? []).includes(tool.slug) &&
      [tool.name, tool.slug, tool.description].join(" ").toLowerCase().includes(normalized),
  );
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
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

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Could not load specialist data.";
}
