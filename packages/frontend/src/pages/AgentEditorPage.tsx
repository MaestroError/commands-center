import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { CreateAgentInput, UpdateAgentInput } from "@cc/shared/schemas";

import { AgentForm } from "@/components/agents/AgentForm";
import {
  agentFormSlug,
  createAgentFormFromAgent,
  createEmptyAgentForm,
  resolveCustomToolOverwriteSlugs,
  validateAgentForm,
  type AgentFormErrors,
  type AgentFormState,
} from "@/lib/agent-form";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { useAgentCustomToolsQuery } from "@/hooks/use-custom-tools-query";
import {
  useAgentCatalogQuery,
  useAgentMutations,
  useAgentQuery,
  useAgentsQuery,
} from "@/hooks/use-agents-query";

type AgentEditorPageProps = {
  mode: "create" | "edit";
};

type AppliedAgentSnapshot = {
  key: string;
  updatedAtMs: number;
};

export function AgentEditorPage(props: AgentEditorPageProps) {
  const params = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const catalogQuery = useAgentCatalogQuery();
  const agentsQuery = useAgentsQuery();
  const agentQuery = useAgentQuery(props.mode === "edit" ? params.slug : undefined);
  const agentMutations = useAgentMutations();
  const [form, setForm] = useState<AgentFormState>(createEmptyAgentForm());
  const [errors, setErrors] = useState<AgentFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const appliedSnapshotRef = useRef<AppliedAgentSnapshot | undefined>(undefined);
  const catalog = catalogQuery.data;
  const agents = agentsQuery.data ?? [];
  const agent = agentQuery.data;
  const agentCustomToolsQuery = useAgentCustomToolsQuery(agent?.id);
  const hasProviderModels = (catalog?.providerModels.length ?? 0) > 0;

  useEffect(() => {
    if (!catalog) {
      return;
    }

    if (props.mode === "edit" && !agent) {
      return;
    }

    const nextKey = props.mode === "create" ? "create" : `${agent?.slug}:${agent?.updatedAt}`;

    if (!nextKey) {
      return;
    }

    if (props.mode === "edit" && agent?.updatedAt) {
      const nextUpdatedAtMs = Date.parse(agent.updatedAt);
      const currentSnapshot = appliedSnapshotRef.current;

      if (
        currentSnapshot &&
        Number.isFinite(nextUpdatedAtMs) &&
        nextUpdatedAtMs < currentSnapshot.updatedAtMs
      ) {
        return;
      }
    }

    if (appliedSnapshotRef.current?.key === nextKey) {
      return;
    }

    appliedSnapshotRef.current = {
      key: nextKey,
      updatedAtMs:
        props.mode === "edit" && agent?.updatedAt ? Date.parse(agent.updatedAt) : Number.NaN,
    };
    setForm(createAgentFormFromAgent(catalog, agent));
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
          <AgentForm
            agentId={agent?.id}
            errors={errors}
            mode={props.mode}
            onChange={(next) => {
              setForm(next);
              setErrors({});
              setSaveError(undefined);
            }}
            value={form}
          />

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(undefined);

    const slugTaken = agents.some(
      (entry) => entry.slug === agentFormSlug(form.name) && entry.id !== agent?.id,
    );
    const validation = validateAgentForm(form, { hasProviderModels, slugTaken });
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
      fallbackModels: form.fallbackModels
        .map((model) => model.trim())
        .filter((model) => model && model !== form.defaultModel.trim()),
      iconPath: form.iconPath.trim() || undefined,
      customToolOverwriteSlugs: overwriteSlugs,
      capabilities: form.capabilities,
      rewriteAgentsMd: form.rewriteAgentsMd,
    };

    try {
      if (props.mode === "create") {
        await agentMutations.create.mutateAsync(payload as CreateAgentInput);
        void navigate("/agents", { replace: true });
        return;
      }

      if (!agent) {
        return;
      }

      await agentMutations.update.mutateAsync({ id: agent.id, input: payload });
      void navigate("/agents", { replace: true });
    } catch (error) {
      setSaveError(readError(error));
    }
  }
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Agent editor could not be loaded.";
}
