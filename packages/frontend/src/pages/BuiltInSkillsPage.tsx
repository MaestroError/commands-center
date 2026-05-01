import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { Agent, BuiltInSkill } from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useAgentCatalogQuery, useAgentMutations, useAgentsQuery } from "@/hooks/use-agents-query";
import { useWorkspaceSkillMutations } from "@/hooks/use-workspace-skills-query";
import { normalizeUploadableFiles, toFileManagerUploadEntries } from "@/lib/file-transfer";

type SkillEntry = {
  source: "built-in" | "workspace";
  key: string;
  skill: BuiltInSkill;
};

export function BuiltInSkillsPage() {
  const catalogQuery = useAgentCatalogQuery();
  const agentsQuery = useAgentsQuery();
  const agentMutations = useAgentMutations();
  const workspaceSkillMutations = useWorkspaceSkillMutations();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "built-in" | "workspace">("all");
  const [selectedKey, setSelectedKey] = useState<string>();
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [actionError, setActionError] = useState<string>();
  const deferredSearch = useDeferredValue(search);
  const agents = agentsQuery.data ?? [];
  const skills = useMemo<SkillEntry[]>(() => {
    const builtIn = (catalogQuery.data?.builtInSkills ?? []).map((skill) => ({
      source: "built-in" as const,
      key: `built-in:${skill.slug}`,
      skill,
    }));
    const workspace = (catalogQuery.data?.workspaceSkills ?? []).map((skill) => ({
      source: "workspace" as const,
      key: `workspace:${skill.slug}`,
      skill,
    }));

    return [...builtIn, ...workspace];
  }, [catalogQuery.data]);
  const filteredSkills = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return skills.filter((entry) => {
      const matchesSource = sourceFilter === "all" || entry.source === sourceFilter;
      const matchesSearch =
        query.length === 0 ||
        `${entry.skill.name} ${entry.skill.slug} ${entry.skill.description} ${entry.skill.category}`
          .toLowerCase()
          .includes(query);

      return matchesSource && matchesSearch;
    });
  }, [deferredSearch, skills, sourceFilter]);

  useEffect(() => {
    if (uploadInputRef.current) {
      uploadInputRef.current.setAttribute("webkitdirectory", "");
      uploadInputRef.current.setAttribute("directory", "");
    }
  }, []);

  useEffect(() => {
    if (!filteredSkills.some((entry) => entry.key === selectedKey)) {
      setSelectedKey(filteredSkills[0]?.key);
    }
  }, [filteredSkills, selectedKey]);

  const selectedEntry =
    filteredSkills.find((entry) => entry.key === selectedKey) ?? filteredSkills[0];
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);

  return (
    <div className="grid gap-4">
      <PageHeader
        description="Browse curated skills, create reusable workspace skills, and assign or remove them from agent workspaces."
        eyebrow="Skills"
        title="Skills library"
      />

      <section className="cc-panel p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Create workspace skill</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Start with a folder and `SKILL.md`, then finish the skill in the file manager.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <input
                className="cc-input"
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Skill name"
                value={newName}
              />
              <input
                className="cc-input"
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Description"
                value={newDescription}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="cc-button"
                  disabled={
                    workspaceSkillMutations.create.isPending ||
                    newName.trim().length === 0 ||
                    newDescription.trim().length === 0
                  }
                  onClick={() => void handleCreateWorkspaceSkill()}
                  type="button"
                >
                  {workspaceSkillMutations.create.isPending ? "Creating..." : "Create"}
                </button>
                <button
                  className="cc-button cc-button-secondary"
                  disabled={workspaceSkillMutations.upload.isPending}
                  onClick={() => uploadInputRef.current?.click()}
                  type="button"
                >
                  Upload skill
                </button>
                <Link
                  className="cc-button cc-button-secondary"
                  to="/files?root=workspace&path=skills"
                >
                  Browse folder
                </Link>
              </div>
            </div>
            <input
              className="hidden"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void handleUploadWorkspaceSkill(files);
              }}
              ref={uploadInputRef}
              type="file"
            />
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary lg:max-w-sm">
            <p className="font-medium text-text-primary">Workspace skills are portable</p>
            <p className="mt-2">
              They live under `.cc/workspace/skills/` and are copied into selected agent workspaces
              on save.
            </p>
          </div>
        </div>
      </section>

      <section className="cc-panel p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem]">
          <input
            className="cc-input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search skills"
            value={search}
          />
          <select
            className="cc-input"
            onChange={(event) =>
              setSourceFilter(event.target.value as "all" | "built-in" | "workspace")
            }
            value={sourceFilter}
          >
            <option value="all">All sources</option>
            <option value="built-in">Built-in</option>
            <option value="workspace">Workspace</option>
          </select>
        </div>
      </section>

      {actionError ? <section className="cc-alert">{actionError}</section> : null}
      {catalogQuery.isLoading || agentsQuery.isLoading ? <LoadingState /> : null}
      {catalogQuery.error ? (
        <ErrorState
          description={readError(catalogQuery.error)}
          title="Skills could not be loaded."
        />
      ) : null}
      {agentsQuery.error ? (
        <ErrorState
          description={readError(agentsQuery.error)}
          title="Agents could not be loaded."
        />
      ) : null}
      {!catalogQuery.isLoading &&
      !catalogQuery.error &&
      !agentsQuery.isLoading &&
      !agentsQuery.error &&
      skills.length === 0 ? (
        <EmptyState
          description="Built-in skills are bundled with CommandsCenter. Create or upload a workspace skill to add your own reusable instructions."
          title="No skills available"
        />
      ) : null}
      {!catalogQuery.isLoading &&
      !catalogQuery.error &&
      !agentsQuery.isLoading &&
      !agentsQuery.error &&
      skills.length > 0 &&
      filteredSkills.length === 0 ? (
        <EmptyState
          description="Try a different search term or source filter to find the skill you need."
          title="No skills match this filter"
        />
      ) : null}

      {!catalogQuery.isLoading && !catalogQuery.error && filteredSkills.length > 0 ? (
        <WorkspaceLayout
          contextPane={
            selectedEntry
              ? {
                  title: "Skill details",
                  tabs: [
                    {
                      id: "details",
                      label: "Details",
                      content: (
                        <SkillDetail
                          actionBusy={
                            workspaceSkillMutations.delete.isPending ||
                            agentMutations.update.isPending
                          }
                          agent={selectedAgent}
                          agents={agents}
                          entry={selectedEntry}
                          onAssign={() => void handleAssignSkill(selectedEntry, selectedAgent)}
                          onDelete={() => void handleDeleteWorkspaceSkill(selectedEntry)}
                          onRemove={() => void handleRemoveSkill(selectedEntry, selectedAgent)}
                          onSelectAgent={setSelectedAgentId}
                          selectedAgentId={selectedAgentId}
                        />
                      ),
                    },
                  ],
                }
              : undefined
          }
          primary={
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSkills.map((entry) => {
                const selected = selectedEntry?.key === entry.key;

                return (
                  <button
                    className={
                      selected
                        ? "rounded-xl border border-accent/30 bg-accent/5 p-5 text-left"
                        : "rounded-xl border border-border bg-surface p-5 text-left"
                    }
                    key={entry.key}
                    onClick={() => setSelectedKey(entry.key)}
                    type="button"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-text-primary">{entry.skill.name}</p>
                      <SourceBadge source={entry.source} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      {entry.skill.description}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-secondary">
                      <span className="rounded-full border border-border px-2 py-1">
                        {entry.skill.category}
                      </span>
                      {entry.skill.version ? (
                        <span className="rounded-full border border-border px-2 py-1">
                          v{entry.skill.version}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          }
        />
      ) : null}
    </div>
  );

  async function handleCreateWorkspaceSkill() {
    setActionError(undefined);

    try {
      const created = await workspaceSkillMutations.create.mutateAsync({
        name: newName,
        description: newDescription,
      });
      setNewName("");
      setNewDescription("");
      window.location.assign(buildWorkspaceSkillFileManagerUrl(created.skill));
    } catch (error) {
      setActionError(readError(error));
    }
  }

  async function handleUploadWorkspaceSkill(files: File[]) {
    if (files.length === 0) {
      return;
    }

    setActionError(undefined);

    try {
      const entries = await toFileManagerUploadEntries(normalizeUploadableFiles(files, "folder"));
      await workspaceSkillMutations.upload.mutateAsync({ entries, overwrite: false });
    } catch (error) {
      const message = readError(error);

      if (message.includes("already exists")) {
        const confirmed = window.confirm(
          "A workspace skill with this slug already exists. Overwrite it with the uploaded version?",
        );

        if (!confirmed) {
          return;
        }

        const entries = await toFileManagerUploadEntries(normalizeUploadableFiles(files, "folder"));
        await workspaceSkillMutations.upload.mutateAsync({ entries, overwrite: true });
        return;
      }

      setActionError(message);
    }
  }

  async function handleDeleteWorkspaceSkill(entry: SkillEntry) {
    if (entry.source !== "workspace") {
      return;
    }

    if (!window.confirm(`Delete workspace skill '${entry.skill.name}'?`)) {
      return;
    }

    setActionError(undefined);

    try {
      await workspaceSkillMutations.delete.mutateAsync(entry.skill.slug);
    } catch (error) {
      setActionError(readError(error));
    }
  }

  async function handleAssignSkill(entry: SkillEntry, agent?: Agent) {
    if (!agent) {
      return;
    }

    setActionError(undefined);

    try {
      await agentMutations.update.mutateAsync({
        id: agent.id,
        input: {
          capabilities:
            entry.source === "built-in"
              ? {
                  ...agent.capabilities,
                  builtInSkills: Array.from(
                    new Set([...agent.capabilities.builtInSkills, entry.skill.slug]),
                  ),
                }
              : {
                  ...agent.capabilities,
                  workspaceSkills: Array.from(
                    new Set([...(agent.capabilities.workspaceSkills ?? []), entry.skill.slug]),
                  ),
                },
        },
      });
    } catch (error) {
      setActionError(readError(error));
    }
  }

  async function handleRemoveSkill(entry: SkillEntry, agent?: Agent) {
    if (!agent) {
      return;
    }

    setActionError(undefined);

    try {
      await agentMutations.update.mutateAsync({
        id: agent.id,
        input: {
          capabilities:
            entry.source === "built-in"
              ? {
                  ...agent.capabilities,
                  builtInSkills: agent.capabilities.builtInSkills.filter(
                    (slug) => slug !== entry.skill.slug,
                  ),
                }
              : {
                  ...agent.capabilities,
                  workspaceSkills: (agent.capabilities.workspaceSkills ?? []).filter(
                    (slug) => slug !== entry.skill.slug,
                  ),
                },
        },
      });
    } catch (error) {
      setActionError(readError(error));
    }
  }
}

function SkillDetail(props: {
  entry: SkillEntry;
  agents: Agent[];
  agent?: Agent;
  selectedAgentId?: string;
  actionBusy: boolean;
  onSelectAgent: (value: string | undefined) => void;
  onAssign: () => void;
  onRemove: () => void;
  onDelete: () => void;
}) {
  const assigned =
    props.agent === undefined
      ? false
      : props.entry.source === "built-in"
        ? props.agent.capabilities.builtInSkills.includes(props.entry.skill.slug)
        : (props.agent.capabilities.workspaceSkills ?? []).includes(props.entry.skill.slug);

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-text-primary">{props.entry.skill.name}</p>
          <SourceBadge source={props.entry.source} />
        </div>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {props.entry.skill.description}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        <span className="rounded-full border border-border px-2 py-1">
          {props.entry.skill.category}
        </span>
        {props.entry.skill.version ? (
          <span className="rounded-full border border-border px-2 py-1">
            v{props.entry.skill.version}
          </span>
        ) : null}
        {props.entry.skill.compatibility ? (
          <span className="rounded-full border border-border px-2 py-1">
            {props.entry.skill.compatibility}
          </span>
        ) : null}
      </div>
      {Object.keys(props.entry.skill.metadata).length > 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
          {Object.entries(props.entry.skill.metadata).map(([key, value]) => (
            <p key={key}>
              <span className="font-medium text-text-primary">{key}:</span> {value}
            </p>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-4">
        <p className="font-medium text-text-primary">Agent assignment</p>
        <select
          className="cc-input"
          onChange={(event) => props.onSelectAgent(event.target.value || undefined)}
          value={props.selectedAgentId ?? ""}
        >
          <option value="">Select an agent</option>
          {props.agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            className="cc-button"
            disabled={props.agent === undefined || assigned || props.actionBusy}
            onClick={props.onAssign}
            type="button"
          >
            Assign to agent
          </button>
          <button
            className="cc-button cc-button-secondary"
            disabled={props.agent === undefined || !assigned || props.actionBusy}
            onClick={props.onRemove}
            type="button"
          >
            Remove from agent
          </button>
          {props.entry.source === "workspace" ? (
            <Link
              className="cc-button cc-button-secondary"
              to={buildWorkspaceSkillFileManagerUrl(props.entry.skill)}
            >
              Open files
            </Link>
          ) : null}
          {props.entry.source === "workspace" ? (
            <button
              className="cc-button cc-button-secondary"
              disabled={props.actionBusy}
              onClick={props.onDelete}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {props.entry.skill.files.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="font-medium text-text-primary">Files</p>
          <ul className="mt-3 grid gap-2 text-sm text-text-secondary">
            {props.entry.skill.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.entry.skill.detailsMarkdown ? (
        <pre className="overflow-auto rounded-lg border border-border bg-terminal-bg p-4 text-sm text-terminal-fg whitespace-pre-wrap">
          {props.entry.skill.detailsMarkdown}
        </pre>
      ) : null}
    </div>
  );
}

function SourceBadge(props: { source: SkillEntry["source"] }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-text-secondary">
      {props.source === "built-in" ? "Built-in" : "Workspace"}
    </span>
  );
}

function buildWorkspaceSkillFileManagerUrl(skill: BuiltInSkill): string {
  const params = new URLSearchParams({
    root: "workspace",
    path: `skills/${skill.slug}`,
    select: `skills/${skill.slug}/SKILL.md`,
  });
  return `/files?${params.toString()}`;
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Skills request failed.";
}
