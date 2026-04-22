import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { useAgentCatalogQuery, useAgentMutations, useAgentQuery } from "@/hooks/use-agents-query";
import {
  createSessionSettingsForm,
  validateSessionSettingsForm,
  type SessionSettingsFormErrors,
  type SessionSettingsFormState,
} from "@/lib/agent-form";

type SessionSettingsTabProps = {
  agentSlug: string;
};

export function SessionSettingsTab({ agentSlug }: SessionSettingsTabProps) {
  const agentQuery = useAgentQuery(agentSlug);
  const catalogQuery = useAgentCatalogQuery();
  const agentMutations = useAgentMutations();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<SessionSettingsFormState>({
    defaultModel: "",
    role: "",
    instructions: "",
  });
  const [errors, setErrors] = useState<SessionSettingsFormErrors>({});
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [successMessage, setSuccessMessage] = useState<string | undefined>(undefined);
  const initializedKeyRef = useRef<string | undefined>(undefined);
  const catalog = catalogQuery.data;
  const agent = agentQuery.data;
  const hasProviderModels = (catalog?.providerModels.length ?? 0) > 0;

  useEffect(() => {
    if (!agent || !catalog || isEditing) {
      return;
    }

    const nextKey = `${agent.slug}:${agent.updatedAt}`;
    if (initializedKeyRef.current === nextKey) {
      return;
    }

    initializedKeyRef.current = nextKey;
    setForm(createSessionSettingsForm(catalog, agent));
    setErrors({});
    setSaveError(undefined);
  }, [agent, catalog, isEditing]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(undefined), 3_000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const modelLabel = useMemo(() => {
    if (!catalog) {
      return agent?.defaultModel ?? "";
    }

    return (
      catalog.providerModels.find((model) => model.id === form.defaultModel)?.label ??
      agent?.defaultModel ??
      form.defaultModel
    );
  }, [agent?.defaultModel, catalog, form.defaultModel]);

  if (agentQuery.isLoading || catalogQuery.isLoading) {
    return <LoadingState />;
  }

  if (agentQuery.error || catalogQuery.error || !agent || !catalog) {
    return (
      <ErrorState
        description={readError(agentQuery.error ?? catalogQuery.error)}
        title="Session settings could not be loaded."
      />
    );
  }

  const loadedAgent = agent;
  const loadedCatalog = catalog;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-text-primary">{agent.name}</h2>
          <p className="mt-1 text-xs text-text-secondary">Current agent settings</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            aria-label="Open full agent editor"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
            to={`/agents/${loadedAgent.slug}/edit`}
          >
            <OpenInNewIcon />
          </Link>
          {isEditing ? (
            <button
              className="text-sm text-text-secondary transition hover:text-text-primary"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
          ) : (
            <button
              aria-label="Edit agent settings"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
              onClick={() => {
                setIsEditing(true);
                setSuccessMessage(undefined);
                setSaveError(undefined);
              }}
              type="button"
            >
              <PencilIcon />
            </button>
          )}
        </div>
      </div>

      {successMessage ? <section className="cc-success py-2">{successMessage}</section> : null}

      <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
        <SettingsSection error={errors.defaultModel} label="Model" required>
          {isEditing ? (
            hasProviderModels ? (
              <select
                aria-label="Model"
                className="cc-input"
                onChange={(event) => updateField("defaultModel", event.target.value)}
                value={form.defaultModel}
              >
                <option value="">Select a model</option>
                {catalog.providerModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-3 text-sm text-text-secondary">
                No connected models.{" "}
                <Link className="text-accent hover:underline" to="/providers">
                  Manage providers
                </Link>
              </div>
            )
          ) : (
            <ReadOnlyValue value={modelLabel || "Not configured"} />
          )}
        </SettingsSection>

        <SettingsSection error={errors.role} label="Role" required>
          {isEditing ? (
            <input
              aria-label="Role"
              className="cc-input"
              onChange={(event) => updateField("role", event.target.value)}
              type="text"
              value={form.role}
            />
          ) : (
            <ReadOnlyValue value={loadedAgent.role} />
          )}
        </SettingsSection>

        <SettingsSection error={errors.instructions} label="Instructions" required>
          {isEditing ? (
            <textarea
              aria-label="Instructions"
              className="cc-input min-h-48 resize-y"
              onChange={(event) => updateField("instructions", event.target.value)}
              value={form.instructions}
            />
          ) : (
            <ReadOnlyValue multiline value={loadedAgent.instructions} />
          )}
        </SettingsSection>

        {isEditing ? (
          <div className="space-y-3">
            {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}
            <button className="cc-button" disabled={agentMutations.update.isPending} type="submit">
              {agentMutations.update.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );

  function updateField<Key extends keyof SessionSettingsFormState>(
    key: Key,
    value: SessionSettingsFormState[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError(undefined);
  }

  function handleCancel() {
    setForm(createSessionSettingsForm(loadedCatalog, loadedAgent));
    setErrors({});
    setSaveError(undefined);
    setIsEditing(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage(undefined);

    const validation = validateSessionSettingsForm(form, hasProviderModels);
    setErrors(validation);

    if (Object.values(validation).some(Boolean)) {
      return;
    }

    try {
      await agentMutations.update.mutateAsync({
        id: loadedAgent.id,
        input: {
          name: loadedAgent.name,
          iconPath: loadedAgent.iconPath,
          capabilities: loadedAgent.capabilities,
          defaultModel: form.defaultModel.trim(),
          role: form.role.trim(),
          instructions: form.instructions.trim(),
        },
      });
      setIsEditing(false);
      setErrors({});
      setSaveError(undefined);
      setSuccessMessage("Saved.");
    } catch (error) {
      setSaveError(readError(error));
    }
  }
}

function SettingsSection(props: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
        <span>{props.label}</span>
        {props.required ? <span className="text-danger">*</span> : null}
      </div>
      {props.children}
      {props.error ? <p className="text-sm text-danger">{props.error}</p> : null}
    </section>
  );
}

function ReadOnlyValue(props: { value: string; multiline?: boolean }) {
  return (
    <div
      className={
        props.multiline
          ? "whitespace-pre-wrap text-sm text-text-primary"
          : "text-sm text-text-primary"
      }
    >
      {props.value}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg fill="none" height="15" viewBox="0 0 24 24" width="15">
      <path
        d="m12 20 8-8-4-4-8 8-1 5z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m14.5 7.5 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function OpenInNewIcon() {
  return (
    <svg fill="none" height="15" viewBox="0 0 24 24" width="15">
      <path
        d="M14 5h5v5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M10 14 19 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function readError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Session settings failed to load.";
}
