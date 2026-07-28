// Split out of TasksPage.tsx (issue #99).

import { ModelSelector } from "@/components/chat/ModelSelector";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { TaskPromptComposer } from "@/components/tasks/TaskPromptComposer";
import { formatRepeatSummary, formatToken } from "@/components/tasks/task-format";
import { useSpecialistCatalogQuery, useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useTaskMutations, useTaskTemplateQuery } from "@/hooks/use-tasks-query";
import type { CreateTaskTemplateInput, Specialist, TaskTemplate } from "@cc/shared/schemas";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { deriveMcpToolName } from "@cc/shared/schemas";
import { getTaskTemplateCreationPrefill, useTaskComposerSkills } from "./task-helpers";
import { FallbackModelsField, WeekdayPicker } from "./TaskFormPage";
import {
  type FormState,
  REPEAT_FREQUENCIES,
  REPEAT_PRESETS,
  type RepeatFrequency,
  type RepeatPreset,
  type TaskTemplateCreationPrefill,
  buildRepeatRule,
  formToTemplateInput,
  formatRepeatPreset,
  listTimezones,
  readError,
  templateToForm,
} from "./task-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TaskTemplateForm(props: {
  agents: Specialist[];
  cancelLabel: string;
  initialTemplate?: TaskTemplate;
  prefill?: TaskTemplateCreationPrefill;
  isBusy: boolean;
  submitLabel: string;
  title: string;
  onCancel: () => void;
  onSubmit: (input: CreateTaskTemplateInput) => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    templateToForm(props.initialTemplate, props.prefill),
  );
  const catalogQuery = useSpecialistCatalogQuery();
  const selectedAgent = props.agents.find((agent) => agent.id === form.agentId);
  const templateSkills = useTaskComposerSkills(selectedAgent, catalogQuery.data);
  const timezones = useMemo(() => listTimezones(), []);

  useEffect(() => {
    if (props.initialTemplate) {
      setForm(templateToForm(props.initialTemplate));
    }
  }, [props.initialTemplate]);

  return (
    <form
      className="cc-panel grid gap-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(formToTemplateInput(form));
      }}
    >
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{props.title}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Templates store reusable task setup. Create a task from a template manually, run it
          immediately, or enable repeating.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1 text-sm text-text-secondary">
          Title
          <Input
            data-testid="task-template-title-input"
            required
            value={form.title}
            onChange={(event) => updateForm({ title: event.target.value })}
          />
        </label>
        <div className="grid gap-1 text-sm text-text-secondary">
          <span>Default specialist</span>
          <SearchableSelect
            required
            ariaLabel="Default specialist"
            onChange={(agentId) => updateForm({ agentId })}
            options={props.agents.map((agent) => ({ id: agent.id, label: agent.name }))}
            placeholder="Search specialists..."
            value={form.agentId}
          />
        </div>
        <label className="grid gap-1 text-sm text-text-secondary">
          Model
          <ModelSelector
            allowSpecialistDefault
            defaultModel={props.agents.find((agent) => agent.id === form.agentId)?.defaultModel}
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
            Use # to mention workspace files and / to pick a skill available to the selected agent.
          </p>
        </div>
        <TaskPromptComposer
          agentId={form.agentId || undefined}
          disabled={!form.agentId}
          onChange={(prompt) => updateForm({ prompt })}
          skills={templateSkills}
          value={form.prompt}
        />
      </section>
      <section className="grid min-w-0 gap-2 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <input
            checked={form.enabled}
            data-testid="task-template-active-input"
            onChange={(event) => updateForm({ enabled: event.target.checked })}
            type="checkbox"
          />
          Active
        </label>
        <p className="text-sm text-text-secondary">
          {form.enabled
            ? "Active templates run on their schedule and can be triggered by automation."
            : "Disabled templates keep all settings but never run automatically until re-enabled. You can still Run now manually."}
        </p>
      </section>
      <McpConfigSection form={form} updateForm={updateForm} />
      <section className="grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
          <input
            checked={form.repeatEnabled}
            onChange={(event) => updateForm({ repeatEnabled: event.target.checked })}
            type="checkbox"
          />
          Repeat on a schedule
        </label>
        {form.repeatEnabled ? (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="grid min-w-0 gap-1 text-sm text-text-secondary">
                <span>Repeat</span>
                <Select
                  value={form.repeatPreset}
                  onValueChange={(repeatPreset) =>
                    updateForm({ repeatPreset: repeatPreset as RepeatPreset })
                  }
                >
                  <SelectTrigger aria-label="Repeat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEAT_PRESETS.map((preset) => (
                      <SelectItem key={preset} value={preset}>
                        {formatRepeatPreset(preset)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                First occurrence
                <Input
                  className="min-w-0"
                  type="datetime-local"
                  value={form.anchorAtLocal}
                  onChange={(event) => updateForm({ anchorAtLocal: event.target.value })}
                />
              </label>
              <div className="grid min-w-0 gap-1 text-sm text-text-secondary">
                <span>Timezone</span>
                <SearchableSelect
                  ariaLabel="Timezone"
                  className="min-w-0"
                  onChange={(timezone) => updateForm({ timezone })}
                  options={timezones.map((zone) => ({ id: zone, label: zone }))}
                  placeholder="Search timezones..."
                  testId="task-template-timezone-input"
                  value={form.timezone}
                />
              </div>
            </div>
            {form.repeatPreset === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-sm text-text-secondary">
                  Every
                  <Input
                    className="min-w-0"
                    min={1}
                    type="number"
                    value={form.repeatInterval}
                    onChange={(event) => updateForm({ repeatInterval: event.target.value })}
                  />
                </label>
                <div className="grid min-w-0 gap-1 text-sm text-text-secondary">
                  <span>Unit</span>
                  <Select
                    value={form.repeatFrequency}
                    onValueChange={(repeatFrequency) =>
                      updateForm({ repeatFrequency: repeatFrequency as RepeatFrequency })
                    }
                  >
                    <SelectTrigger aria-label="Unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPEAT_FREQUENCIES.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {formatToken(frequency)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.repeatFrequency === "week" ? (
                  <WeekdayPicker form={form} updateForm={updateForm} />
                ) : null}
              </div>
            ) : null}
            {form.repeatPreset === "weekly" ? (
              <WeekdayPicker form={form} updateForm={updateForm} />
            ) : null}
            <p className="text-sm text-text-secondary">
              {formatRepeatSummary(buildRepeatRule(form))}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-secondary">
            Repetition is off. This template will only create tasks when you choose Create task or
            Run now.
          </p>
        )}
      </section>
      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-lg bg-surface py-2">
        <Button data-testid="task-template-save" disabled={props.isBusy} type="submit">
          {props.submitLabel}
        </Button>
        <Button variant="secondary" onClick={props.onCancel} type="button">
          {props.cancelLabel}
        </Button>
      </div>
      <div className="grid gap-1">
        <label className="grid gap-1 text-sm text-text-secondary">
          Acceptance criteria, one per line
          <Textarea
            className="min-h-24 resize-none"
            value={form.todosText}
            onChange={(event) => updateForm({ todosText: event.target.value })}
          />
        </label>
        <p className="text-xs text-text-muted">
          What &ldquo;done&rdquo; looks like. The assigned specialist sees these in its run context
          but can&apos;t check them off — you verify each during review.
        </p>
      </div>
    </form>
  );

  function updateForm(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }
}

function McpConfigSection(props: {
  form: FormState;
  updateForm: (patch: Partial<FormState>) => void;
}) {
  const { form, updateForm } = props;
  const derivedName = deriveMcpToolName(form.title || "");
  const effectiveName = form.mcpToolName.trim() || derivedName;

  return (
    <section className="grid min-w-0 gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-medium text-text-primary">Public MCP tools</h2>
      <p className="text-sm text-text-secondary">
        Configure which versions of this template tool are offered on the public MCP server. Each
        token still chooses which templates it may use.
      </p>
      <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          checked={form.mcpSyncEnabled}
          data-testid="template-mcp-expose-input"
          onChange={(event) => updateForm({ mcpSyncEnabled: event.target.checked })}
          type="checkbox"
        />
        Enable sync tool
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <input
          checked={form.mcpAsyncEnabled}
          data-testid="template-mcp-async-input"
          onChange={(event) => updateForm({ mcpAsyncEnabled: event.target.checked })}
          type="checkbox"
        />
        Enable async tool
      </label>
      <p className="text-xs text-text-muted">
        Adds a <code className="font-mono">{effectiveName || "…"}_async</code> tool that starts the
        task in the background.
      </p>
      {form.mcpAsyncEnabled ? (
        <label className="flex items-start gap-2 text-sm text-text-primary">
          <input
            checked={form.mcpAsyncAlwaysAcknowledge}
            className="mt-1"
            data-testid="template-mcp-async-acknowledge-input"
            onChange={(event) => updateForm({ mcpAsyncAlwaysAcknowledge: event.target.checked })}
            type="checkbox"
          />
          <span>
            <span className="block font-medium">Always return success acknowledgement</span>
            <span className="mt-1 block text-xs text-text-muted">
              Never return a run id from this async tool, even when the token can check results.
            </span>
          </span>
        </label>
      ) : null}

      {form.mcpSyncEnabled || form.mcpAsyncEnabled ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm text-text-secondary">
            Tool name
            <Input
              data-testid="template-mcp-tool-name-input"
              onChange={(event) => updateForm({ mcpToolName: event.target.value })}
              placeholder={derivedName || "create_linkedin_post"}
              value={form.mcpToolName}
            />
            <span className="text-xs text-text-muted">
              MCP tool name: <code className="font-mono">{effectiveName || "—"}</code>. Leave blank
              to derive it from the title.
            </span>
          </label>

          <label className="grid gap-1 text-sm text-text-secondary">
            Tool description
            <Textarea
              className="min-h-16 resize-y"
              onChange={(event) => updateForm({ mcpToolDescription: event.target.value })}
              placeholder="Falls back to the task prompt when empty."
              value={form.mcpToolDescription}
            />
          </label>

          <label className="grid gap-1 text-sm text-text-secondary">
            &ldquo;text&rdquo; argument description
            <Input
              onChange={(event) => updateForm({ mcpTextFieldDescription: event.target.value })}
              placeholder="What the caller should pass as text context."
              value={form.mcpTextFieldDescription}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <input
              checked={form.mcpAllowFiles}
              data-testid="template-mcp-allow-files-input"
              onChange={(event) => updateForm({ mcpAllowFiles: event.target.checked })}
              type="checkbox"
            />
            Allow files
          </label>

          {form.mcpAllowFiles ? (
            <label className="grid gap-1 text-sm text-text-secondary">
              &ldquo;files&rdquo; argument description
              <Input
                onChange={(event) => updateForm({ mcpFilesFieldDescription: event.target.value })}
                placeholder="What files the caller should attach."
                value={form.mcpFilesFieldDescription}
              />
            </label>
          ) : null}

          <div className="grid gap-2 rounded-lg border border-border bg-app-bg p-3">
            <span className="text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
              Artifact URLs
            </span>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                checked={form.mcpDisplayableUrlEnabled}
                onChange={(event) => updateForm({ mcpDisplayableUrlEnabled: event.target.checked })}
                type="checkbox"
              />
              Return displayable URL
            </label>
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input
                checked={form.mcpDownloadableUrlEnabled}
                onChange={(event) =>
                  updateForm({ mcpDownloadableUrlEnabled: event.target.checked })
                }
                type="checkbox"
              />
              Return downloadable URL
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function TaskTemplateFormPage(props: { mode?: "create" | "edit" } = {}) {
  const mode = props.mode ?? "edit";
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const templateQuery = useTaskTemplateQuery(params["id"]);
  const agentsQuery = useSpecialistsQuery();
  const mutations = useTaskMutations();
  const template = templateQuery.data;
  const agents = agentsQuery.data ?? [];
  const isLoading =
    mode === "create" ? agentsQuery.isLoading : templateQuery.isLoading || agentsQuery.isLoading;
  const error = readError(
    (mode === "create" ? undefined : templateQuery.error) ??
      agentsQuery.error ??
      (mode === "create" ? mutations.createTemplate.error : mutations.updateTemplate.error),
  );

  if (mode === "create") {
    const prefill = getTaskTemplateCreationPrefill(location.state);
    return (
      <div className="grid gap-4">
        <PageHeader
          actions={
            <Link className={buttonVariants({ variant: "secondary" })} to="/tasks?view=templates">
              Cancel
            </Link>
          }
          description="Create a reusable task template. Add repetition only when it should run on a schedule."
          eyebrow="Task Templates"
          title="New task template"
        />

        {agentsQuery.isLoading ? <LoadingState testId="task-template-form-loading" /> : null}
        {error ? <ErrorState description={error} title="Template could not be created." /> : null}
        {!agentsQuery.isLoading ? (
          <TaskTemplateForm
            agents={agents}
            cancelLabel="Cancel"
            prefill={prefill}
            isBusy={mutations.createTemplate.isPending}
            submitLabel="Create template"
            title="New task template"
            onCancel={() => void navigate("/tasks?view=templates")}
            onSubmit={(input) => {
              mutations.createTemplate.mutate(input, {
                onSuccess: (created) =>
                  void navigate(`/tasks?view=templates&template=${created.id}`),
              });
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <Link className={buttonVariants({ variant: "secondary" })} to="/tasks?view=templates">
            Cancel
          </Link>
        }
        description="Update the template setup used for future generated tasks. Existing generated tasks keep their copied content."
        eyebrow="Task Templates"
        title="Edit task template"
      />

      {isLoading ? <LoadingState testId="task-template-form-loading" /> : null}
      {error ? <ErrorState description={error} title="Template could not be saved." /> : null}
      {!isLoading && template ? (
        <TaskTemplateForm
          agents={agents}
          cancelLabel="Cancel"
          initialTemplate={template}
          isBusy={mutations.updateTemplate.isPending}
          submitLabel="Save template"
          title="Edit task template"
          onCancel={() => void navigate(`/tasks?view=templates&template=${template.id}`)}
          onSubmit={(input) => {
            mutations.updateTemplate.mutate(
              { id: template.id, input },
              {
                onSuccess: (updated) =>
                  void navigate(`/tasks?view=templates&template=${updated.id}`),
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
