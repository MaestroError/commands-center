import { useMemo, useState } from "react";
import { Link } from "react-router";

import type {
  Specialist,
  CustomTool,
  CustomToolAgentCopy,
  CustomToolDriftStatus,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import {
  useSpecialistCustomToolsQuery,
  useCustomToolMutations,
  useCustomToolsQuery,
} from "@/hooks/use-custom-tools-query";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CopyConflictState =
  | {
      kind: "copy-to-specialists";
      tool: CustomTool;
      selectedAgentIds: string[];
      destinationName: string;
    }
  | {
      kind: "copy-to-global";
      agentId: string;
      tool: CustomToolAgentCopy;
      destinationName: string;
    };

export function CustomToolsPage() {
  const customToolsQuery = useCustomToolsQuery();
  const agentsQuery = useSpecialistsQuery();
  const mutations = useCustomToolMutations();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [actionError, setActionError] = useState<string>();
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [copyTool, setCopyTool] = useState<CustomTool>();
  const [selectedCopyAgentIds, setSelectedCopyAgentIds] = useState<string[]>([]);
  const [copyConflict, setCopyConflict] = useState<CopyConflictState>();
  const [removeTool, setRemoveTool] = useState<CustomToolAgentCopy>();
  const [showMobileDrift, setShowMobileDrift] = useState(false);
  const agents = agentsQuery.data ?? [];
  const globalTools = customToolsQuery.data ?? [];
  const filteredTools = useMemo(
    () => filterTools(customToolsQuery.data ?? [], search),
    [customToolsQuery.data, search],
  );
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  const agentToolsQuery = useSpecialistCustomToolsQuery(selectedAgent?.id);
  const agentTools = agentToolsQuery.data ?? [];

  async function handleCreateTool() {
    setActionError(undefined);

    try {
      const created = await mutations.create.mutateAsync({
        name: newName,
        description: newDescription,
      });
      setNewName("");
      setNewDescription("");
      window.location.assign(buildGlobalToolFileManagerUrl(created.tool));
    } catch (error) {
      setActionError(readError(error));
    }
  }

  async function handleDeleteTool(tool: CustomTool) {
    if (
      !window.confirm(
        `Delete global tool '${tool.name}'? Existing specialist copies will remain untouched.`,
      )
    ) {
      return;
    }

    setActionError(undefined);

    try {
      await mutations.delete.mutateAsync(tool.slug);
    } catch (error) {
      setActionError(readError(error));
    }
  }

  async function handleCopyToAgents(input?: {
    overwrite?: boolean;
    destinationName?: string;
    selectedAgentIds?: string[];
    tool?: CustomTool;
  }) {
    const tool = input?.tool ?? copyTool;
    const agentIds = input?.selectedAgentIds ?? selectedCopyAgentIds;

    if (!tool || agentIds.length === 0) {
      return;
    }

    setActionError(undefined);

    try {
      await mutations.copyToSpecialists.mutateAsync({
        slug: tool.slug,
        input: {
          agentIds,
          destinationName: input?.destinationName?.trim() || undefined,
          overwrite: input?.overwrite ?? false,
        },
      });
      setCopyTool(undefined);
      setSelectedCopyAgentIds([]);
      setCopyConflict(undefined);
    } catch (error) {
      const message = readError(error);

      if ((input?.overwrite ?? false) === false && isCopyConflictError(message)) {
        setCopyConflict({
          kind: "copy-to-specialists",
          tool,
          selectedAgentIds: agentIds,
          destinationName: input?.destinationName?.trim() || tool.name,
        });
        return;
      }

      setActionError(message);
    }
  }

  async function handleCopyAgentToolToGlobal(
    tool: CustomToolAgentCopy,
    input?: {
      overwrite?: boolean;
      destinationName?: string;
    },
  ) {
    if (!selectedAgent) {
      return;
    }

    setActionError(undefined);

    try {
      await mutations.copySpecialistToGlobal.mutateAsync({
        agentId: selectedAgent.id,
        slug: tool.slug,
        input: {
          destinationName: input?.destinationName?.trim() || undefined,
          overwrite: input?.overwrite ?? false,
        },
      });
      setCopyConflict(undefined);
    } catch (error) {
      const message = readError(error);
      if ((input?.overwrite ?? false) === false && isCopyConflictError(message)) {
        setCopyConflict({
          kind: "copy-to-global",
          agentId: selectedAgent.id,
          tool,
          destinationName: input?.destinationName?.trim() || tool.name,
        });
        return;
      }

      setActionError(message);
    }
  }

  async function handleRemoveAgentTool(tool: CustomToolAgentCopy) {
    if (!selectedAgent) {
      return;
    }

    setActionError(undefined);

    try {
      await mutations.deleteSpecialistTool.mutateAsync({
        agentId: selectedAgent.id,
        slug: tool.slug,
      });
      setRemoveTool(undefined);
    } catch (error) {
      setActionError(readError(error));
    }
  }

  return (
    <div className="relative grid gap-4">
      <section className="cc-panel p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="grid gap-6">
            <div>
              <p className="cc-eyebrow">Custom Tools</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
                Custom tools
              </h1>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Global library and specialist copies.
              </p>
            </div>

            <div className="grid max-w-2xl gap-2">
              <Input
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Tool name"
                value={newName}
              />
              <Input
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Description"
                value={newDescription}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={mutations.create.isPending || newName.trim().length === 0}
                  onClick={() => void handleCreateTool()}
                  type="button"
                >
                  {mutations.create.isPending ? "Creating..." : "Create"}
                </Button>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  to="/files?root=workspace&path=custom-tools"
                >
                  Browse
                </Link>
              </div>
            </div>

            <div className="lg:hidden">
              <Button
                variant="secondary"
                onClick={() => setShowMobileDrift((current) => !current)}
                type="button"
              >
                {showMobileDrift ? "Hide drift" : "Show drift"}
              </Button>
              {showMobileDrift ? <MobileDriftLegend /> : null}
            </div>
          </div>

          <div className="hidden lg:block lg:justify-self-end">
            <div className="rounded-xl border border-border bg-surface/90 p-4 backdrop-blur-sm">
              <DesktopDriftLegend />
            </div>
          </div>
        </div>
      </section>

      {actionError ? <section className="cc-alert">{actionError}</section> : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="cc-panel grid gap-4 p-6 xl:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Global tools</h2>
            </div>
            <Input
              className="w-full sm:max-w-xs"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tools"
              value={search}
            />
          </div>

          {customToolsQuery.isLoading ? <LoadingState /> : null}
          {customToolsQuery.error ? (
            <ErrorState
              description={readError(customToolsQuery.error)}
              title="Global tools could not be loaded."
            />
          ) : null}

          {!customToolsQuery.isLoading && !customToolsQuery.error && filteredTools.length === 0 ? (
            <EmptyState
              description="Create a tool or change the search."
              title={globalTools.length === 0 ? "No custom tools yet" : "No matching tools"}
            />
          ) : null}

          {!customToolsQuery.isLoading && !customToolsQuery.error && filteredTools.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredTools.map((tool) => (
                <article className="rounded-xl border border-border bg-surface p-4" key={tool.slug}>
                  <div className="grid gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">{tool.name}</h3>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                          {tool.slug}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">
                        {tool.description || "No description yet."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                        <span className="rounded-full border border-border px-2 py-1">
                          {tool.entryFile}
                        </span>
                        <span className="rounded-full border border-border px-2 py-1">
                          {tool.usage.length} specialist copy{tool.usage.length === 1 ? "" : "ies"}
                        </span>
                      </div>
                      {tool.warnings.length > 0 ? (
                        <div className="mt-3 rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-foreground">
                          {tool.warnings.map((warning) => warning.message).join(" ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className={buttonVariants({ variant: "secondary" })}
                        to={buildGlobalToolFileManagerUrl(tool)}
                      >
                        Open
                      </Link>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCopyTool(tool);
                          setSelectedCopyAgentIds([]);
                        }}
                        type="button"
                      >
                        Copy to specialists
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void handleDeleteTool(tool)}
                        type="button"
                      >
                        Delete
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!selectedAgent}
                        onClick={() =>
                          selectedAgent
                            ? void handleCopyToAgents({
                                tool,
                                selectedAgentIds: [selectedAgent.id],
                              })
                            : undefined
                        }
                        title={
                          selectedAgent
                            ? `Copy to ${selectedAgent.name}`
                            : "Select a specialist first"
                        }
                        type="button"
                      >
                        &gt;&gt;
                      </Button>
                    </div>
                  </div>
                  {tool.usage.length > 0 ? (
                    <div className="mt-4 grid gap-2 border-t border-border pt-4">
                      {tool.usage.map((usage) => (
                        <div
                          className="flex flex-wrap items-center gap-2 text-sm text-text-secondary"
                          key={`${tool.slug}-${usage.agentId}`}
                        >
                          <StatusBadge status={usage.status} />
                          <Link
                            className="text-text-primary underline-offset-4 hover:underline"
                            to={`/specialists/${usage.agentSlug}/edit`}
                          >
                            {usage.agentName}
                          </Link>
                          <span className="text-xs">
                            {usage.copiedAt ? new Date(usage.copiedAt).toLocaleString() : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="cc-panel grid gap-4 p-6">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Specialist tools</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Tool changes apply to new chats. Start a fresh chat with this specialist to use an
                updated tool set.
              </p>
            </div>
            <SearchableSelect
              ariaLabel="Specialist tools"
              emptyOptionLabel="No specialist"
              onChange={(agentId) => setSelectedAgentId(agentId || undefined)}
              options={agents.map((agent) => ({ id: agent.id, label: agent.name }))}
              placeholder="Search specialists..."
              value={selectedAgentId ?? ""}
            />
          </div>

          {!selectedAgent ? (
            <EmptyState description="Choose a specialist." title="No specialist selected" />
          ) : agentToolsQuery.isLoading ? (
            <LoadingState />
          ) : agentToolsQuery.error ? (
            <ErrorState
              description={readError(agentToolsQuery.error)}
              title="Specialist tools could not be loaded."
            />
          ) : agentTools.length === 0 ? (
            <EmptyState
              description="No local tools in this workspace."
              title="No specialist tools"
            />
          ) : (
            <div className="grid gap-4">
              {agentTools.map((tool) => (
                <article className="rounded-xl border border-border bg-surface p-4" key={tool.slug}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">{tool.name}</h3>
                        <StatusBadge status={tool.status} />
                        {!tool.isManaged ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
                            Manual
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">
                        {tool.description || "No description available."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className={buttonVariants({ variant: "secondary" })}
                        to={buildSpecialistToolFileManagerUrl(selectedAgent, tool)}
                      >
                        Open
                      </Link>
                      <Button
                        variant="secondary"
                        onClick={() => void handleCopyAgentToolToGlobal(tool)}
                        type="button"
                      >
                        Copy to global
                      </Button>
                      <Button variant="secondary" onClick={() => setRemoveTool(tool)} type="button">
                        Remove
                      </Button>
                    </div>
                  </div>
                  {tool.warnings.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-foreground">
                      {tool.warnings.map((warning) => warning.message).join(" ")}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {copyTool ? (
        <section className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Copy {copyTool.name} to agents
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Existing specialist copies may be replaced if you confirm an overwrite.
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  Newly copied tools are picked up in new chats. If the specialist already has an
                  open chat, start a fresh chat after copying.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setCopyTool(undefined)} type="button">
                Close
              </Button>
            </div>
            <div className="mt-4 grid max-h-80 gap-3 overflow-auto">
              {agents.map((agent) => {
                const checked = selectedCopyAgentIds.includes(agent.id);

                return (
                  <label
                    className="flex items-start gap-3 rounded-xl border border-border bg-app-bg px-4 py-3"
                    key={agent.id}
                  >
                    <input
                      checked={checked}
                      onChange={() =>
                        setSelectedCopyAgentIds((current) =>
                          current.includes(agent.id)
                            ? current.filter((value) => value !== agent.id)
                            : [...current, agent.id],
                        )
                      }
                      type="checkbox"
                    />
                    <div>
                      <p className="font-medium text-text-primary">{agent.name}</p>
                      <p className="text-sm text-text-secondary">{agent.slug}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={
                  selectedCopyAgentIds.length === 0 || mutations.copyToSpecialists.isPending
                }
                onClick={() => void handleCopyToAgents()}
                type="button"
              >
                {mutations.copyToSpecialists.isPending ? "Copying..." : "Copy selected specialists"}
              </Button>
              <Button variant="secondary" onClick={() => setCopyTool(undefined)} type="button">
                Cancel
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {copyConflict ? (
        <CopyConflictDialog
          busy={
            copyConflict.kind === "copy-to-specialists"
              ? mutations.copyToSpecialists.isPending
              : mutations.copySpecialistToGlobal.isPending
          }
          currentName={
            copyConflict.kind === "copy-to-specialists"
              ? copyConflict.tool.name
              : copyConflict.tool.name
          }
          destinationName={copyConflict.destinationName}
          message={
            copyConflict.kind === "copy-to-specialists"
              ? "A tool with this name already exists in at least one selected specialist. Rewrite it or copy a renamed variant."
              : "A tool with this name already exists globally. Rewrite it or copy a renamed variant."
          }
          onCancel={() => setCopyConflict(undefined)}
          onChange={(value) =>
            setCopyConflict((current) =>
              current ? { ...current, destinationName: value } : current,
            )
          }
          onCopyWithNewName={() => {
            if (copyConflict.kind === "copy-to-specialists") {
              void handleCopyToAgents({
                tool: copyConflict.tool,
                selectedAgentIds: copyConflict.selectedAgentIds,
                destinationName: copyConflict.destinationName,
                overwrite: false,
              });
              return;
            }

            void handleCopyAgentToolToGlobal(copyConflict.tool, {
              destinationName: copyConflict.destinationName,
              overwrite: false,
            });
          }}
          onRewrite={() => {
            if (copyConflict.kind === "copy-to-specialists") {
              void handleCopyToAgents({
                tool: copyConflict.tool,
                selectedAgentIds: copyConflict.selectedAgentIds,
                overwrite: true,
              });
              return;
            }

            void handleCopyAgentToolToGlobal(copyConflict.tool, { overwrite: true });
          }}
        />
      ) : null}

      {removeTool && selectedAgent ? (
        <RemoveAgentToolDialog
          busy={mutations.deleteSpecialistTool.isPending}
          name={removeTool.name}
          onCancel={() => setRemoveTool(undefined)}
          onConfirm={() => void handleRemoveAgentTool(removeTool)}
        />
      ) : null}
    </div>
  );
}

function filterTools(tools: CustomTool[], search: string): CustomTool[] {
  const query = search.trim().toLowerCase();

  if (query.length === 0) {
    return tools;
  }

  return tools.filter((tool) => {
    const haystack = [tool.name, tool.slug, tool.description].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function buildGlobalToolFileManagerUrl(tool: CustomTool): string {
  const params = new URLSearchParams({
    root: "workspace",
    path: `custom-tools/${tool.slug}`,
    select: `custom-tools/${tool.slug}/${tool.entryFile}`,
  });
  return `/files?${params.toString()}`;
}

function buildSpecialistToolFileManagerUrl(agent: Specialist, tool: CustomToolAgentCopy): string {
  const selectedRelativePath = tool.isManaged
    ? `specialists/${agent.slug}/.opencode/tools/${tool.slug}/tool.ts`
    : `specialists/${agent.slug}/.opencode/tools/${tool.entryFile}`;
  const params = new URLSearchParams({
    root: "workspace",
    path: `specialists/${agent.slug}/.opencode/tools`,
    select: selectedRelativePath,
  });
  return `/files?${params.toString()}`;
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
    global_only: "border-border bg-surface-elevated text-text-secondary",
    agent_only: "border-border bg-surface-elevated text-text-secondary",
    matching: "border-success-border bg-success-surface text-success-foreground",
    outdated: "border-warning-border bg-warning-surface text-warning-foreground",
    modified: "border-danger-border bg-danger-surface text-danger-foreground",
    unknown: "border-border bg-surface-elevated text-text-secondary",
  }[props.status];

  return <span className={`rounded-full border px-2 py-0.5 text-xs ${className}`}>{label}</span>;
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Custom tools request failed.";
}

function DesktopDriftLegend() {
  return (
    <div className="grid gap-2 text-sm text-text-secondary">
      <span className="font-medium text-text-primary">Drift</span>
      <span className="flex items-center gap-2">
        <StatusBadge status="matching" /> up to date
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="outdated" /> needs refresh
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="modified" /> local edits
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="unknown" /> no proof
      </span>
    </div>
  );
}

function MobileDriftLegend() {
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
      <span className="font-medium text-text-primary">Drift</span>
      <span className="flex items-center gap-2">
        <StatusBadge status="matching" /> up to date
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="outdated" /> needs refresh
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="modified" /> local edits
      </span>
      <span className="flex items-center gap-2">
        <StatusBadge status="unknown" /> no proof
      </span>
    </div>
  );
}

function isCopyConflictError(message: string): boolean {
  return (
    message.includes("already exists") ||
    message.includes("local differences") ||
    message.includes("Confirm overwrite")
  );
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return slug || "tool";
}

function CopyConflictDialog(props: {
  currentName: string;
  destinationName: string;
  message: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onRewrite: () => void;
  onCopyWithNewName: () => void;
}) {
  const rewriteEnabled = slugify(props.destinationName) === slugify(props.currentName);
  const renameEnabled = props.destinationName.trim().length > 0 && !rewriteEnabled;

  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary">Tool name conflict</h2>
        <p className="mt-2 text-sm text-text-secondary">{props.message}</p>
        <label className="mt-4 grid gap-2 text-sm text-text-primary">
          <span>Name</span>
          <Input
            onChange={(event) => props.onChange(event.target.value)}
            value={props.destinationName}
          />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onCancel} type="button">
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={!rewriteEnabled || props.busy}
            onClick={props.onRewrite}
            type="button"
          >
            Rewrite
          </Button>
          <Button
            disabled={!renameEnabled || props.busy}
            onClick={props.onCopyWithNewName}
            type="button"
          >
            Copy with new name
          </Button>
        </div>
      </div>
    </section>
  );
}

function RemoveAgentToolDialog(props: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="fixed inset-0 z-50 flex items-center justify-center bg-app-bg/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-text-primary">Remove specialist-local tool</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Remove <span className="font-medium text-text-primary">{props.name}</span> from this
          specialist workspace.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onCancel} type="button">
            Cancel
          </Button>
          <Button disabled={props.busy} onClick={props.onConfirm} type="button">
            Remove
          </Button>
        </div>
      </div>
    </section>
  );
}
