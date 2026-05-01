import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { Agent } from "@cc/shared/schemas";

import { AgentAvatar } from "@/components/agents/agent-avatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useAgentMutations, useAgentsQuery } from "@/hooks/use-agents-query";

const EMPTY_AGENTS: Agent[] = [];

export function AgentsPage() {
  const agentsQuery = useAgentsQuery();
  const agentMutations = useAgentMutations();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Agent>();
  const deferredSearch = useDeferredValue(search);
  const agents = agentsQuery.data ?? EMPTY_AGENTS;
  const filteredAgents = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    if (query.length === 0) {
      return agents;
    }

    return agents.filter((agent) => {
      const haystack = `${agent.name} ${agent.role}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [agents, deferredSearch]);

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className="cc-button" to="/agents/new">
            Create agent
          </Link>
        }
        description="Browse, search, edit, delete, and launch every agent from a single grid without relying on sidebar shortcuts."
        eyebrow="Agents"
        title="All workspace agents"
      />

      <section className="cc-panel p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Agent directory</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Search by agent name or role, then jump straight into chat or editing.
            </p>
          </div>
          <label className="block w-full max-w-md" htmlFor="agent-search-input">
            <span className="sr-only">Search agents</span>
            <input
              className="cc-input"
              id="agent-search-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or role"
              value={search}
            />
          </label>
        </div>
      </section>

      {agentsQuery.isLoading ? <LoadingState testId="agents-loading" /> : null}
      {agentsQuery.error ? (
        <ErrorState
          action={
            <button
              className="cc-button cc-button-secondary"
              onClick={() => void agentsQuery.refetch()}
              type="button"
            >
              Try again
            </button>
          }
          description={readError(agentsQuery.error)}
          title="Agents could not be loaded."
        />
      ) : null}

      {!agentsQuery.isLoading && !agentsQuery.error && agents.length === 0 ? (
        <EmptyState
          action={
            <Link className="cc-button" to="/agents/new">
              Create your first agent
            </Link>
          }
          description="Add an agent with a default model and built-in skills to start building direct chat workflows."
          title="No agents yet"
        />
      ) : null}

      {!agentsQuery.isLoading &&
      !agentsQuery.error &&
      agents.length > 0 &&
      filteredAgents.length === 0 ? (
        <EmptyState
          description="Try a different search term or clear the current filter to see all available agents."
          title="No agents match this search"
        />
      ) : null}

      {!agentsQuery.isLoading && !agentsQuery.error && filteredAgents.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map((agent) => (
            <article className="cc-panel flex min-h-72 flex-col p-5" key={agent.id}>
              <div className="flex items-start gap-4">
                <AgentAvatar iconPath={agent.iconPath} name={agent.name} size="lg" />
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold text-text-primary">{agent.name}</h2>
                  <p className="mt-1 text-sm text-text-secondary">{agent.role}</p>
                </div>
              </div>

              <p className="mt-5 line-clamp-4 text-sm leading-6 text-text-secondary">
                {agent.instructions}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs text-accent">
                  {agent.defaultModel}
                </span>
                {agent.capabilities.builtInSkills.map((skill) => (
                  <span
                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary"
                    key={skill}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                <Link className="cc-button" to={`/chat/${agent.slug}`}>
                  Open chat
                </Link>
                <Link className="cc-button cc-button-secondary" to={`/agents/${agent.slug}/edit`}>
                  Edit
                </Link>
                <button
                  className="cc-button cc-button-danger"
                  onClick={() => setPendingDelete(agent)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-app-bg/75 p-3 sm:items-center sm:p-6"
          onClick={() => setPendingDelete(undefined)}
        >
          <section
            className="cc-panel w-full max-w-lg p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-text-primary">
              Delete {pendingDelete.name}?
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              This archives the agent and moves its workspace data out of the active agents folder.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                className="cc-button cc-button-danger"
                onClick={() => void handleDelete()}
                type="button"
              >
                Confirm delete
              </button>
              <button
                className="cc-button cc-button-secondary"
                onClick={() => setPendingDelete(undefined)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );

  async function handleDelete() {
    if (!pendingDelete) {
      return;
    }

    await agentMutations.archive.mutateAsync(pendingDelete.id);
    setPendingDelete(undefined);
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Agents could not be loaded.";
}
