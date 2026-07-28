// Split out of TasksPage.tsx (issue #99).

import { ModelSelector } from "@/components/chat/ModelSelector";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import { WorkspaceFilesTab } from "@/components/workspace/WorkspaceFilesTab";
import { useSpecialistCatalogQuery, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useTaskMutations, useTaskQuery } from "@/hooks/use-tasks-query";
import {
  MAX_FALLBACK_MODELS,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@cc/shared/schemas";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useTaskComposerSkills } from "./task-helpers";
import {
  type FormState,
  WEEKDAYS,
  formToTaskInput,
  getTaskCreationPrefill,
  normalizeTaskFallbackModels,
  readError,
  taskToForm,
} from "./task-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function TaskFormPage(props: { mode: "create" | "edit" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const taskQuery = useTaskQuery(props.mode === "edit" ? params["id"] : undefined);
  const agentsQuery = useSpecialistsQuery();
  const catalogQuery = useSpecialistCatalogQuery();
  const mutations = useTaskMutations();
  const task = taskQuery.data;
  const agents = agentsQuery.data ?? [];
  const prefill = getTaskCreationPrefill(location.state);
  const [form, setForm] = useState<FormState>(() => taskToForm(task, prefill));
  const selectedAgent = agents.find((agent) => agent.id === form.agentId);
  const taskSkills = useTaskComposerSkills(selectedAgent, catalogQuery.data);

  useMemo(() => {
    if (task) setForm(taskToForm(task));
  }, [task]);

  const isLoading =
    agentsQuery.isLoading ||
    catalogQuery.isLoading ||
    (props.mode === "edit" && taskQuery.isLoading);
  const error = readError(
    agentsQuery.error ??
      catalogQuery.error ??
      taskQuery.error ??
      mutations.create.error ??
      mutations.update.error,
  );

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link
            className={buttonVariants({ variant: "secondary" })}
            to={task ? `/tasks/${task.id}` : "/tasks"}
          >
            Cancel
          </Link>
        }
        description="Define the schedule, assigned specialist, and lightweight task todo list. Run-specific context is added when triggering the task."
        eyebrow="Tasks"
        title={props.mode === "create" ? "Create task" : "Edit task"}
      />

      {isLoading ? <LoadingState testId="task-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Task could not be saved." /> : null}

      {!isLoading ? (
        <WorkspaceLayout
          contextPane={{
            title: selectedAgent ? `${selectedAgent.name} workspace` : "Specialist workspace",
            tabs: [
              {
                id: "files",
                label: "Files",
                content: selectedAgent ? (
                  <div className="flex h-full flex-col">
                    <WorkspaceFilesTab agentId={selectedAgent.id} agentSlug={selectedAgent.slug} />
                  </div>
                ) : (
                  <p className="p-3 text-sm text-text-secondary">
                    Select a specialist to browse workspace files and drag files into the task
                    prompt.
                  </p>
                ),
              },
            ],
            defaultTabId: "files",
          }}
          primary={
            <form
              className="grid h-full gap-5 overflow-auto p-4 sm:p-6"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Title
                  <Input
                    value={form.title}
                    onChange={(event) => updateForm({ title: event.target.value })}
                  />
                </label>
                <div className="grid gap-1 text-sm text-text-secondary">
                  <span>Assigned specialist</span>
                  <SearchableSelect
                    required
                    ariaLabel="Assigned specialist"
                    onChange={handleAgentChange}
                    options={agents.map((agent) => ({ id: agent.id, label: agent.name }))}
                    placeholder="Search specialists..."
                    value={form.agentId}
                  />
                </div>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Model
                  <ModelSelector
                    allowSpecialistDefault
                    defaultModel={agents.find((agent) => agent.id === form.agentId)?.defaultModel}
                    onChange={(model) => updateForm({ model })}
                    placement="down"
                    value={form.model || null}
                  />
                </label>
                <FallbackModelsField
                  fallbackModels={form.fallbackModels}
                  primaryModel={form.model}
                  onChange={(fallbackModels) => updateForm({ fallbackModels })}
                />
              </div>

              <section className="grid gap-1 text-sm text-text-secondary">
                <div>
                  <h2 className="font-medium text-text-primary">Task prompt</h2>
                  <p className="text-xs text-text-secondary">
                    Use # to mention workspace files and / to pick a skill available to the selected
                    agent.
                  </p>
                </div>
                <TaskPromptComposer
                  agentId={form.agentId || undefined}
                  disabled={!form.agentId}
                  onChange={(prompt) => updateForm({ prompt })}
                  skills={taskSkills}
                  value={form.prompt}
                />
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Schedule for
                  <Input
                    type="datetime-local"
                    value={form.scheduledAtLocal}
                    onChange={(event) => updateForm({ scheduledAtLocal: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-sm text-text-secondary">
                  Due by
                  <Input
                    type="datetime-local"
                    value={form.dueAtLocal}
                    onChange={(event) => updateForm({ dueAtLocal: event.target.value })}
                  />
                </label>
              </div>
              {props.mode === "edit" && task?.scheduledAt ? (
                <Button
                  variant="secondary"
                  className="w-fit"
                  onClick={() => updateForm({ scheduledAtLocal: "" })}
                  type="button"
                >
                  Clear schedule
                </Button>
              ) : null}

              <div className="grid gap-1">
                <label className="grid gap-1 text-sm text-text-secondary">
                  Acceptance criteria, one per line
                  <Textarea
                    className="min-h-28 resize-y"
                    value={form.todosText}
                    onChange={(event) => updateForm({ todosText: event.target.value })}
                  />
                </label>
                <p className="text-xs text-text-muted">
                  What &ldquo;done&rdquo; looks like. The assigned specialist sees these in its run
                  context but can&apos;t check them off — you verify each during review.
                </p>
              </div>

              <section className="rounded-xl border border-border bg-surface p-4">
                <h2 className="font-semibold text-text-primary">Permission profile</h2>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  This UI currently inherits the assigned specialist permissions. Task runs still
                  persist their effective permission snapshot and auto-approve task-safe rules.
                </p>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={mutations.create.isPending || mutations.update.isPending}
                  type="submit"
                >
                  {props.mode === "create" ? "Create task" : "Save task"}
                </Button>
                <Link
                  className={buttonVariants({ variant: "secondary" })}
                  to={task ? `/tasks/${task.id}` : "/tasks"}
                >
                  Cancel
                </Link>
              </div>
            </form>
          }
        />
      ) : null}
    </div>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleAgentChange(agentId: string) {
    setForm((current) => ({
      ...current,
      agentId,
      prompt:
        current.agentId === agentId
          ? current.prompt
          : {
              ...current.prompt,
              mentionedFiles: [],
              mentionedAgents: [],
              selectedSkill: null,
            },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = formToTaskInput(form);

    if (props.mode === "create") {
      await mutations.create.mutateAsync(input as CreateTaskInput);
      void navigate("/tasks");
      return;
    }

    if (task) {
      const updated = await mutations.update.mutateAsync({
        id: task.id,
        input: input as UpdateTaskInput,
      });
      void navigate(`/tasks/${updated.id}`);
    }
  }
}

export function FallbackModelsField(props: {
  fallbackModels: string[];
  primaryModel: string;
  onChange: (fallbackModels: string[]) => void;
}) {
  const displayedModels = props.fallbackModels.slice(0, MAX_FALLBACK_MODELS);
  const canAdd = displayedModels.length < MAX_FALLBACK_MODELS;

  return (
    <section className="grid gap-2 text-sm text-text-secondary">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span>Fallback models</span>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition hover:border-accent/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canAdd}
          title="Add fallback model"
          type="button"
          onClick={() => props.onChange([...displayedModels, ""])}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {displayedModels.length === 0 ? (
        <p className="text-xs text-text-secondary">No fallback models configured.</p>
      ) : (
        <div className="grid gap-2">
          {displayedModels.map((model, index) => (
            <div className="flex min-w-0 items-center gap-2" key={`${model || "empty"}-${index}`}>
              <ModelSelector
                allowEmptySelection
                onChange={(nextModel) => {
                  const next = [...displayedModels];
                  next[index] = nextModel;
                  props.onChange(normalizeTaskFallbackModels(next, props.primaryModel));
                }}
                placeholder="Select fallback"
                placement="down"
                value={model || null}
              />
              <button
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition hover:bg-danger/10 hover:text-danger"
                title="Remove fallback model"
                type="button"
                onClick={() =>
                  props.onChange(
                    displayedModels.filter((_, fallbackIndex) => fallbackIndex !== index),
                  )
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function WeekdayPicker(props: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}) {
  return (
    <fieldset className="grid gap-2 sm:col-span-2">
      <legend className="text-sm text-text-secondary">Weekdays</legend>
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((weekday) => (
          <label
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-secondary"
            key={weekday.value}
          >
            <input
              checked={props.form.repeatWeekdays.includes(weekday.value)}
              onChange={(event) => {
                const selected = event.target.checked
                  ? [...props.form.repeatWeekdays, weekday.value]
                  : props.form.repeatWeekdays.filter((value) => value !== weekday.value);
                props.updateForm({ repeatWeekdays: selected });
              }}
              type="checkbox"
            />
            {weekday.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
