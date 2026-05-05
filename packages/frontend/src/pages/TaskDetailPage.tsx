import { Link, useNavigate, useParams } from "react-router-dom";

import type { Agent, Task, TaskPermissionProfile, TaskRun } from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { formatDate, formatToken } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useAgentsQuery } from "@/hooks/use-agents-query";
import {
  useTaskMutations,
  useTaskQuery,
  useTaskRunQuery,
  useTaskRunsQuery,
  useTaskRunSessionQuery,
} from "@/hooks/use-tasks-query";

type TaskDetailPageProps = {
  mode?: "task" | "run";
};

export function TaskDetailPage(props: TaskDetailPageProps) {
  const params = useParams();
  const taskId = params["id"];
  const runId = params["runId"];
  const taskQuery = useTaskQuery(taskId);
  const agentsQuery = useAgentsQuery();
  const task = taskQuery.data;
  const agent = agentsQuery.data?.find((entry) => entry.id === task?.agentId);

  if (props.mode === "run") {
    return <TaskRunDetail task={task} taskId={taskId} runId={runId} />;
  }

  return (
    <TaskOverview
      task={task}
      agent={agent}
      isLoading={taskQuery.isLoading}
      error={taskQuery.error}
    />
  );
}

function TaskOverview(props: { task?: Task; agent?: Agent; isLoading: boolean; error: unknown }) {
  const mutations = useTaskMutations();
  const runsQuery = useTaskRunsQuery(props.task?.id);
  const task = props.task;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          task ? (
            <>
              <Link className="cc-button cc-button-secondary" to="/tasks">
                All tasks
              </Link>
              <Link className="cc-button cc-button-secondary" to={`/tasks/${task.id}/edit`}>
                Edit
              </Link>
              <button
                className="cc-button"
                onClick={() => void mutations.trigger.mutate(task.id)}
                type="button"
              >
                Run now
              </button>
            </>
          ) : null
        }
        description="Inspect task configuration, todos, permission summary, and every run created by this task."
        eyebrow="Tasks"
        title={task?.title ?? "Task detail"}
      />

      {props.isLoading ? <LoadingState testId="task-detail-loading" /> : null}
      {props.error ? (
        <ErrorState description={readError(props.error)} title="Task could not be loaded." />
      ) : null}
      {!props.isLoading && !task ? (
        <EmptyState description="This task no longer exists." title="Task not found" />
      ) : null}

      {task ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
            <article className="cc-panel grid gap-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                  {formatToken(task.triggerMode)}
                </span>
                <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                  {task.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <TextBlock
                label="Description"
                value={task.description || "No description provided."}
              />
              <TextBlock label="Context" value={task.context || "No additional context."} />
              <PermissionSummary profile={task.permissionProfile} />
            </article>

            <aside className="cc-panel grid gap-4 p-5">
              <Metric label="Assigned agent" value={props.agent?.name ?? task.agentId} />
              <Metric label="Schedule" value={formatSchedule(task)} />
              <Metric label="Latest result" value={task.latestResultSummary ?? "No runs yet"} />
              <div>
                <h2 className="font-semibold text-text-primary">Todos</h2>
                {task.todos.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
                    {task.todos.map((todo) => (
                      <li
                        className="rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
                        key={todo.id}
                      >
                        {todo.status === "completed" ? "[x]" : "[ ]"} {todo.content}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-text-secondary">No todo items.</p>
                )}
              </div>
            </aside>
          </section>

          <RunHistory
            taskId={task.id}
            runs={runsQuery.data ?? []}
            isLoading={runsQuery.isLoading}
            error={runsQuery.error}
          />
        </>
      ) : null}
    </div>
  );
}

function RunHistory(props: {
  taskId: string;
  runs: TaskRun[];
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <section className="cc-panel p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Run history</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review prompts, results, errors, permissions, and task-owned chat sessions.
          </p>
        </div>
      </div>
      {props.isLoading ? <LoadingState testId="task-runs-loading" /> : null}
      {props.error ? (
        <ErrorState description={readError(props.error)} title="Runs could not be loaded." />
      ) : null}
      {!props.isLoading && props.runs.length === 0 ? (
        <EmptyState
          description="Manual and scheduled executions will appear here after the task runs."
          title="No runs yet"
        />
      ) : null}
      {props.runs.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-secondary">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 pr-3">Trigger</th>
                <th className="py-3 pr-3">Started</th>
                <th className="py-3 pr-3">Completed</th>
                <th className="py-3 pr-3">Summary</th>
                <th className="py-3 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {props.runs.map((run) => (
                <tr className="border-b border-border/70" key={run.id}>
                  <td className="py-3 pr-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="py-3 pr-3 text-text-secondary">
                    {formatToken(run.triggerSource)}
                  </td>
                  <td className="py-3 pr-3 text-text-secondary">{formatDate(run.startedAt)}</td>
                  <td className="py-3 pr-3 text-text-secondary">{formatDate(run.completedAt)}</td>
                  <td className="max-w-sm truncate py-3 pr-3 text-text-secondary">
                    {run.resultSummary ?? run.errorMessage ?? "No summary"}
                  </td>
                  <td className="py-3 pr-3">
                    <Link
                      className="cc-button cc-button-secondary"
                      to={`/tasks/${props.taskId}/runs/${run.id}`}
                    >
                      Inspect
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function TaskRunDetail(props: { task?: Task; taskId?: string; runId?: string }) {
  const navigate = useNavigate();
  const runQuery = useTaskRunQuery(props.taskId, props.runId);
  const sessionQuery = useTaskRunSessionQuery(props.taskId, props.runId);
  const mutations = useTaskMutations();
  const run = runQuery.data;

  return (
    <div className="grid gap-4">
      <PageHeader
        actions={
          <>
            <Link
              className="cc-button cc-button-secondary"
              to={props.taskId ? `/tasks/${props.taskId}` : "/tasks"}
            >
              Back to task
            </Link>
            {sessionQuery.data?.canOpenInChat && props.taskId && props.runId ? (
              <button className="cc-button" onClick={() => void openInChat()} type="button">
                Open in chat
              </button>
            ) : null}
          </>
        }
        description="Audit the exact prompt, result, errors, effective permissions, and task-owned OpenCode session for this run."
        eyebrow="Task Run"
        title={props.task?.title ?? "Run detail"}
      />

      {runQuery.isLoading ? <LoadingState testId="task-run-loading" /> : null}
      {runQuery.error ? (
        <ErrorState description={readError(runQuery.error)} title="Run could not be loaded." />
      ) : null}
      {run ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <article className="cc-panel grid gap-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                {formatToken(run.triggerSource)}
              </span>
            </div>
            <TextBlock
              label="Rendered prompt"
              value={run.renderedPrompt || "No prompt recorded."}
              code
            />
            <JsonBlock label="Rendered context" value={run.renderedContext} />
            <JsonBlock label="Result" value={run.result} />
            <JsonBlock label="Effective permissions" value={run.effectivePermissions} />
          </article>
          <aside className="cc-panel grid content-start gap-4 p-5">
            <Metric label="Started" value={formatDate(run.startedAt)} />
            <Metric label="Completed" value={formatDate(run.completedAt)} />
            <Metric label="Session" value={run.opencodeSessionId ?? "No session"} />
            {run.errorMessage ? <TextBlock label="Error" value={run.errorMessage} /> : null}
            <JsonBlock label="Error details" value={run.errorDetails} />
            {sessionQuery.data?.diagnostics.length ? (
              <JsonBlock label="Session diagnostics" value={sessionQuery.data.diagnostics} />
            ) : null}
          </aside>
        </section>
      ) : null}
    </div>
  );

  async function openInChat() {
    if (!props.taskId || !props.runId) return;
    const snapshot = await mutations.openInChat.mutateAsync({
      taskId: props.taskId,
      runId: props.runId,
    });
    void navigate(
      `/chat/${encodeURIComponent(snapshot.current.agentId)}/${encodeURIComponent(snapshot.current.id)}`,
    );
  }
}

function PermissionSummary(props: { profile?: TaskPermissionProfile }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold text-text-primary">Permission summary</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {props.profile
          ? `Custom tools: ${String(props.profile.customTools?.length ?? 0)}. External MCP: ${String(props.profile.mcpServers?.length ?? 0)}. App MCP: ${String(props.profile.appMcpServers?.length ?? 0)}.`
          : "Inherits the assigned agent permissions. Each run stores its effective permission snapshot."}
      </p>
    </section>
  );
}

function TextBlock(props: { label: string; value: string; code?: boolean }) {
  return (
    <section>
      <h2 className="font-semibold text-text-primary">{props.label}</h2>
      {props.code ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-border bg-surface p-3 text-xs text-text-primary whitespace-pre-wrap">
          {props.value}
        </pre>
      ) : (
        <p className="mt-2 text-sm leading-6 text-text-secondary">{props.value}</p>
      )}
    </section>
  );
}

function JsonBlock(props: { label: string; value: unknown }) {
  if (props.value === undefined) return null;
  return <TextBlock label={props.label} value={JSON.stringify(props.value, null, 2)} code />;
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 break-words font-medium text-text-primary">{props.value}</p>
    </div>
  );
}

function formatSchedule(task: Task): string {
  if (task.schedule.mode === "scheduled_once") return formatDate(task.schedule.runAt);
  if (task.schedule.mode === "recurring") return task.schedule.cronExpression;
  return "Manual only";
}

function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}
