// Split out of TasksPage.tsx (issue #99).

import { CopyableCode } from "@/components/api/EndpointsTab";
import { Markdown } from "@/components/chat/Markdown";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { TabBar } from "@/components/common/TabBar";
import { formatDate } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import {
  useTaskMutations,
  useTaskTemplateQuery,
  useTaskTemplateTasksQuery,
} from "@/hooks/use-tasks-query";
import { buildTemplateEndpointDocs } from "@cc/shared/lib";
import type { CreateTaskTemplateInput, Specialist, Task, TaskTemplate } from "@cc/shared/schemas";
import { Check, Copy, Info, Pencil, Play, Power, PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CopyEndpointButton, TaskCardIconButton, TemplateDisabledBadge } from "./TaskBoard";
import { Metric, TextBlock } from "./TaskDetailPanel";
import { TaskTodos } from "./TaskDetailSections";
import { TaskTemplateForm } from "./TaskTemplateFormPage";
import {
  formatSourceTemplate,
  formatTemplateRepeat,
  readBoardStatus,
  readError,
  templateAsTask,
} from "./task-helpers";

export function TaskTemplatesView(props: {
  templates: TaskTemplate[];
  agents: Specialist[];
  currentSearch: string;
  isCreating: boolean;
  isCreatingBusy: boolean;
  onCancelCreate: () => void;
  onCreate: (input: CreateTaskTemplateInput) => void;
  onCreateTask: (template: TaskTemplate) => void;
  onEdit: (template: TaskTemplate) => void;
  onRunNow: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
  onToggleActive: (template: TaskTemplate) => void;
  toggleBusy: boolean;
  onSelect: (template: TaskTemplate) => void;
  onStartCreate: () => void;
}) {
  const content = props.isCreating ? (
    <TaskTemplateCreateForm
      agents={props.agents}
      isBusy={props.isCreatingBusy}
      onCancel={props.onCancelCreate}
      onSubmit={props.onCreate}
    />
  ) : null;

  if (props.templates.length === 0) {
    if (props.isCreating) {
      return <div className="grid gap-4">{content}</div>;
    }

    return (
      <div className="grid gap-4">
        <EmptyState
          action={
            <button className="cc-button" onClick={props.onStartCreate} type="button">
              Create template
            </button>
          }
          description="Templates store reusable task setup. Add repetition only when the template should run on a schedule."
          title="No task templates yet"
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {content}
      <section className="grid gap-4 xl:grid-cols-2">
        {props.templates.map((template) => {
          const agent = props.agents.find((entry) => entry.id === template.defaultAgentId);
          return (
            <article
              className="cc-panel grid gap-4 p-5"
              data-testid={`task-template-card-${template.id}`}
              key={template.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <button
                    className="text-left text-xl font-semibold text-text-primary transition hover:text-accent"
                    data-testid={`task-template-title-${template.id}`}
                    onClick={() => props.onSelect(template)}
                    type="button"
                  >
                    {template.title}
                  </button>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                    {template.description || "No description provided."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {template.enabled ? null : <TemplateDisabledBadge />}
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-secondary">
                    Template
                  </span>
                </div>
              </div>
              <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
                <Metric label="Default specialist" value={agent?.name ?? template.defaultAgentId} />
                <Metric label="Repeat" value={formatTemplateRepeat(template)} />
                <Metric label="Next task" value={formatDate(template.nextOccurrenceAt)} />
                <Metric
                  label="Last generated"
                  value={formatDate(template.lastGeneratedOccurrenceAt)}
                />
                <Metric label="Latest task" value={template.latestTaskId ?? "None yet"} />
                <Metric label="Timezone" value={template.recurrence?.timezone ?? "Not repeating"} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="cc-button cc-button-secondary"
                  data-testid="task-template-create-task"
                  onClick={() => props.onCreateTask(template)}
                  type="button"
                >
                  Create task
                </button>
                {template.latestTaskId ? (
                  <Link
                    className="cc-button cc-button-secondary"
                    to={`/tasks/${template.latestTaskId}${props.currentSearch}`}
                  >
                    Open latest task
                  </Link>
                ) : null}
                <TaskCardIconButton
                  icon={Play}
                  label="Run now"
                  onClick={() => props.onRunNow(template)}
                  variant="success"
                />
                <TaskCardIconButton
                  disabled={props.toggleBusy}
                  icon={template.enabled ? PowerOff : Power}
                  label={template.enabled ? "Disable template" : "Enable template"}
                  onClick={() => props.onToggleActive(template)}
                />
                <TaskCardIconButton
                  icon={Pencil}
                  label="Edit template"
                  onClick={() => props.onEdit(template)}
                />
                <TaskCardIconButton
                  icon={Info}
                  label="View details"
                  onClick={() => props.onSelect(template)}
                />
                <CopyEndpointButton template={template} />
                <TaskCardIconButton
                  icon={Trash2}
                  label="Delete template"
                  onClick={() => props.onDelete(template)}
                  variant="danger"
                />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function TaskTemplateCreateForm(props: {
  agents: Specialist[];
  isBusy: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateTaskTemplateInput) => void;
}) {
  return (
    <TaskTemplateForm
      agents={props.agents}
      cancelLabel="Cancel"
      isBusy={props.isBusy}
      submitLabel="Create template"
      title="Create task template"
      onCancel={props.onCancel}
      onSubmit={props.onSubmit}
    />
  );
}

export function TaskTemplateDetailPanel(props: {
  templateId: string;
  agents: Specialist[];
  currentSearch: string;
  onClose: () => void;
  onCreateTask: (template: TaskTemplate) => void;
  onEdit: (template: TaskTemplate) => void;
  onOpenTask: (taskId: string) => void;
  onRunNow: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
}) {
  const templateQuery = useTaskTemplateQuery(props.templateId);
  const tasksQuery = useTaskTemplateTasksQuery(props.templateId);
  const mutations = useTaskMutations();
  const [detailTab, setDetailTab] = useState("details");
  const template = templateQuery.data;
  const toggleBusy = mutations.enableTemplate.isPending || mutations.disableTemplate.isPending;
  const agent = template
    ? props.agents.find((entry) => entry.id === template.defaultAgentId)
    : undefined;
  const error = readError(templateQuery.error ?? tasksQuery.error);

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/40"
        data-testid="task-template-detail-backdrop"
        onClick={props.onClose}
      />
      <aside
        aria-label="Task template detail panel"
        className="fixed inset-y-0 right-0 z-50 grid w-full grid-rows-[auto_1fr] border-l border-border bg-surface-elevated shadow-2xl sm:max-w-2xl"
        data-testid="task-template-detail-panel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border bg-surface-elevated p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-secondary">Task template</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">
              {template?.title ?? "Loading template"}
            </h2>
          </div>
          <button className="cc-button cc-button-secondary" onClick={props.onClose} type="button">
            Close
          </button>
        </header>
        <div className="overflow-auto bg-surface-elevated p-4">
          {templateQuery.isLoading ? <LoadingState testId="task-template-panel-loading" /> : null}
          {error ? <ErrorState description={error} title="Template could not be loaded." /> : null}
          {template ? (
            <div className="grid gap-4">
              <TabBar
                activeTabId={detailTab}
                onTabChange={setDetailTab}
                tabs={[
                  { id: "details", label: "Details" },
                  { id: "docs", label: "Docs" },
                ]}
              />
              {detailTab === "docs" ? <TemplateDocsTab template={template} /> : null}
              <div className={detailTab === "details" ? "grid gap-4" : "hidden"}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-border bg-surface px-2 py-1 text-xs text-text-secondary">
                    {formatTemplateRepeat(template)}
                  </span>
                  <span
                    className={
                      template.enabled
                        ? "rounded-full border border-success/40 bg-success/10 px-2 py-1 text-xs text-success"
                        : "rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning"
                    }
                    data-testid="task-template-detail-status"
                  >
                    {template.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <TextBlock
                  label="Description"
                  value={template.description || "No description provided."}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Default specialist"
                    value={agent?.name ?? template.defaultAgentId}
                  />
                  <Metric label="Next occurrence" value={formatDate(template.nextOccurrenceAt)} />
                  <Metric
                    label="Previous occurrence"
                    value={formatDate(template.lastGeneratedOccurrenceAt)}
                  />
                  <Metric
                    label="Timezone"
                    value={template.recurrence?.timezone ?? "Not repeating"}
                  />
                </div>
                <TaskTodos task={templateAsTask(template)} />
                <div className="flex flex-wrap gap-2">
                  <button
                    className="cc-button cc-button-secondary"
                    data-testid="task-template-detail-create-task"
                    onClick={() => props.onCreateTask(template)}
                    type="button"
                  >
                    Create task
                  </button>
                  <TaskCardIconButton
                    icon={Pencil}
                    label="Edit template"
                    onClick={() => props.onEdit(template)}
                  />
                  <TaskCardIconButton
                    icon={Play}
                    label="Run now"
                    onClick={() => props.onRunNow(template)}
                    variant="success"
                  />
                  <TaskCardIconButton
                    disabled={toggleBusy}
                    icon={template.enabled ? PowerOff : Power}
                    label={template.enabled ? "Disable template" : "Enable template"}
                    onClick={() =>
                      void (
                        template.enabled ? mutations.disableTemplate : mutations.enableTemplate
                      ).mutate(template.id)
                    }
                  />
                  {template.latestTaskId ? (
                    <button
                      className="cc-button cc-button-secondary"
                      onClick={() => props.onOpenTask(template.latestTaskId ?? "")}
                      type="button"
                    >
                      Open latest task
                    </button>
                  ) : null}
                  <TaskCardIconButton
                    icon={Trash2}
                    label="Delete template"
                    onClick={() => props.onDelete(template)}
                    variant="danger"
                  />
                </div>
                <GeneratedTaskHistory
                  currentSearch={props.currentSearch}
                  error={tasksQuery.error}
                  isLoading={tasksQuery.isLoading}
                  onOpenTask={props.onOpenTask}
                  tasks={tasksQuery.data ?? []}
                />
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function TemplateDocsTab(props: { template: TaskTemplate }) {
  const [copiedInstructions, setCopiedInstructions] = useState(false);
  const clipboardAvailable = typeof navigator !== "undefined" && Boolean(navigator.clipboard);
  const docs = buildTemplateEndpointDocs({
    template: {
      id: props.template.id,
      title: props.template.title,
      description: props.template.description,
    },
    baseUrl: typeof window !== "undefined" ? window.location.origin : "",
  });

  async function copyInstructions(): Promise<void> {
    if (!clipboardAvailable) {
      return;
    }

    await navigator.clipboard.writeText(docs.agentInstructions);
    setCopiedInstructions(true);
    window.setTimeout(() => setCopiedInstructions(false), 1500);
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-text-primary">Integration instructions</h3>
            <p className="mt-1 text-sm text-text-secondary">
              Self-contained guide you can hand straight to an AI agent. Tokens are never embedded —
              replace the placeholder with one from the API page.
            </p>
          </div>
          <button
            className="cc-button inline-flex items-center gap-2"
            disabled={!clipboardAvailable}
            onClick={() => void copyInstructions()}
            title={clipboardAvailable ? "Copy instructions" : "Clipboard is unavailable"}
            type="button"
          >
            {copiedInstructions ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedInstructions ? "Copied" : "Copy integration instructions"}
          </button>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-app-bg p-4 text-sm">
          <Markdown content={docs.agentInstructions} />
        </div>
      </div>
      <CopyableCode code={docs.triggerCurl} label="Trigger now (curl)" />
      <CopyableCode code={docs.scheduleCurl} label="Schedule (curl)" />
      <CopyableCode code={docs.pollCurl} label="Poll run status (curl)" />
    </div>
  );
}

function GeneratedTaskHistory(props: {
  tasks: Task[];
  currentSearch: string;
  isLoading: boolean;
  error: unknown;
  onOpenTask: (taskId: string) => void;
}) {
  if (props.isLoading) return <LoadingState testId="template-generated-tasks-loading" />;
  if (props.error) {
    return (
      <ErrorState
        description={readError(props.error) ?? "Unknown error"}
        title="Generated tasks could not be loaded."
      />
    );
  }
  if (props.tasks.length === 0) {
    return (
      <EmptyState
        description="Scheduled occurrences and Run Now results will appear here after the template generates tasks."
        title="No generated tasks yet"
      />
    );
  }

  return (
    <section className="grid gap-3">
      <h3 className="font-semibold text-text-primary">Generated tasks</h3>
      {props.tasks.map((task) => (
        <article className="rounded-xl border border-border bg-surface p-4" key={task.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <button
                className="text-left font-semibold text-text-primary transition hover:text-accent"
                onClick={() => props.onOpenTask(task.id)}
                type="button"
              >
                {task.title}
              </button>
              <p className="mt-1 text-sm text-text-secondary">{formatSourceTemplate(task)}</p>
            </div>
            <StatusBadge status={readBoardStatus(task)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              className="cc-button cc-button-secondary"
              to={`/tasks/${task.id}${props.currentSearch}`}
            >
              Open full page
            </Link>
          </div>
          {task.latestFinalMessage ? (
            <p className="mt-3 min-w-0 break-words rounded-lg border border-border bg-surface-elevated p-3 text-xs text-text-secondary [overflow-wrap:anywhere]">
              {task.latestFinalMessage}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
