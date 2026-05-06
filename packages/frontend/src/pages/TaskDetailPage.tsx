import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type {
  Agent,
  ConversationMessage,
  ConversationPart,
  Task,
  TaskPermissionProfile,
  TaskRun,
} from "@cc/shared/schemas";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { PageHeader } from "@/components/common/PageHeader";
import { TabBar } from "@/components/common/TabBar";
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
  const agentsQuery = useAgentsQuery();
  const mutations = useTaskMutations();
  const [activeTabId, setActiveTabId] = useState<"session" | "details">("session");
  const run = runQuery.data;
  const agentSlug = agentsQuery.data?.find(
    (entry) => entry.id === (run?.agentId ?? props.task?.agentId),
  )?.slug;

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
            {sessionQuery.data?.canOpenInChat && props.taskId && props.runId && agentSlug ? (
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
          <article className="cc-panel overflow-hidden p-0">
            <TabBar
              activeTabId={activeTabId}
              onTabChange={(tabId) => {
                if (tabId === "session" || tabId === "details") {
                  setActiveTabId(tabId);
                }
              }}
              tabs={[
                { id: "session", label: "Session" },
                { id: "details", label: "Details" },
              ]}
            />

            <div className="p-5">
              {activeTabId === "session" ? (
                <TaskRunSessionTab
                  conversation={sessionQuery.data?.conversation}
                  diagnostics={sessionQuery.data?.diagnostics ?? []}
                  isLoading={sessionQuery.isLoading}
                  run={run}
                />
              ) : null}

              {activeTabId === "details" ? (
                <TaskRunDetailsTab diagnostics={sessionQuery.data?.diagnostics ?? []} run={run} />
              ) : null}
            </div>
          </article>

          <aside className="cc-panel grid content-start gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={run.status} />
              <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                {formatToken(run.triggerSource)}
              </span>
            </div>
            <Metric label="Started" value={formatDate(run.startedAt)} />
            <Metric label="Completed" value={formatDate(run.completedAt)} />
            <Metric label="Session" value={run.opencodeSessionId ?? "No session"} />
            {run.errorMessage ? <TextBlock label="Error" value={run.errorMessage} /> : null}
            <JsonBlock label="Error details" value={run.errorDetails} />
          </aside>
        </section>
      ) : null}
    </div>
  );

  async function openInChat() {
    if (!props.taskId || !props.runId || !agentSlug) return;
    const snapshot = await mutations.openInChat.mutateAsync({
      taskId: props.taskId,
      runId: props.runId,
    });
    void navigate(
      `/chat/${encodeURIComponent(agentSlug)}/${encodeURIComponent(snapshot.current.id)}`,
    );
  }
}

function TaskRunSessionTab(props: {
  run: TaskRun;
  conversation?: { messages: ConversationMessage[] };
  diagnostics: Array<{ code: string; message: string }>;
  isLoading: boolean;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const messageCount =
    props.conversation?.messages.length ?? readResultMessageCount(props.run.result) ?? 0;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Session</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Review the run summary first, then inspect the recorded session without leaving this
            page.
          </p>
        </div>
        <Metric
          label="Summary"
          value={props.run.resultSummary ?? props.run.errorMessage ?? "No summary"}
        />
        <Metric label="Messages" value={String(messageCount)} />
        {props.diagnostics.length ? (
          <JsonBlock label="Session diagnostics" value={props.diagnostics} />
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <button
          aria-expanded={logOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setLogOpen((current) => !current)}
          type="button"
        >
          <span>
            <span className="block text-lg font-semibold text-text-primary">Session log</span>
            <span className="mt-1 block text-sm text-text-secondary">
              Read the task session exactly as it ran, without converting it into chat.
            </span>
          </span>
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-sm text-text-secondary">
            {logOpen ? "-" : "+"}
          </span>
        </button>

        {logOpen ? <div className="mt-4">{renderSessionLogContent(props)}</div> : null}
      </section>
    </div>
  );
}

function TaskRunDetailsTab(props: {
  run: TaskRun;
  diagnostics: Array<{ code: string; message: string }>;
}) {
  return (
    <div className="grid gap-5">
      <TextBlock
        label="Rendered prompt"
        value={props.run.renderedPrompt || "No prompt recorded."}
        code
      />
      <JsonBlock label="Rendered context" value={props.run.renderedContext} />
      <JsonBlock label="Result" value={props.run.result} />
      <JsonBlock label="Effective permissions" value={props.run.effectivePermissions} />
      {props.diagnostics.length ? (
        <JsonBlock label="Session diagnostics" value={props.diagnostics} />
      ) : null}
    </div>
  );
}

function renderSessionLogContent(props: {
  conversation?: { messages: ConversationMessage[] };
  diagnostics: Array<{ code: string; message: string }>;
  isLoading: boolean;
}) {
  if (props.isLoading) {
    return <LoadingState testId="task-run-session-loading" />;
  }

  if (props.conversation?.messages.length) {
    return (
      <div className="grid gap-3">
        {props.conversation.messages.map((message) => (
          <SessionLogEntry key={message.id} message={message} />
        ))}
      </div>
    );
  }

  if (!props.conversation?.messages.length && props.diagnostics.length === 0) {
    return (
      <EmptyState
        description="This run has a recorded session, but no messages were captured."
        title="No session messages"
      />
    );
  }

  return (
    <EmptyState
      description="The task session could not be rendered. Review the diagnostics in the summary above."
      title="Session unavailable"
    />
  );
}

function SessionLogEntry(props: { message: ConversationMessage }) {
  const toolParts = props.message.parts.filter(isToolPart);
  const hasTextContent = props.message.content.trim().length > 0;

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs uppercase tracking-wide text-text-secondary">
          {props.message.role}
        </span>
        <span className="text-xs text-text-secondary">{formatDate(props.message.createdAt)}</span>
      </div>
      {hasTextContent ? (
        <pre className="mt-3 overflow-auto text-sm leading-6 text-text-primary whitespace-pre-wrap">
          {props.message.content}
        </pre>
      ) : null}

      {toolParts.length ? (
        <div className="mt-3 grid gap-3">
          {toolParts.map((part) => (
            <ToolLogBlock key={part.id} part={part} />
          ))}
        </div>
      ) : null}

      {!hasTextContent && toolParts.length === 0 ? (
        <pre className="mt-3 overflow-auto text-sm leading-6 text-text-primary whitespace-pre-wrap">
          (no text content)
        </pre>
      ) : null}

      {props.message.attachments.length ? (
        <p className="mt-3 text-xs text-text-secondary">
          Attachments:{" "}
          {props.message.attachments
            .map((attachment) => attachment.filename ?? attachment.mimeType)
            .join(", ")}
        </p>
      ) : null}
      {props.message.error ? (
        <p className="mt-3 text-xs text-danger">
          {props.message.error.name}: {props.message.error.message}
        </p>
      ) : null}
    </article>
  );
}

function ToolLogBlock(props: { part: ConversationPart }) {
  const toolName = readToolName(props.part);
  const status = readToolStatus(props.part);
  const input = readToolStateField(props.part, "input");
  const output = readToolStateField(props.part, "output");
  const error = readToolStateField(props.part, "error");

  return (
    <section className="rounded-lg border border-border bg-panel p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
        <span className="rounded-full border border-border px-2 py-1">Tool call</span>
        <span className="font-medium text-text-primary normal-case">{toolName}</span>
        {status ? <span className="normal-case text-text-secondary">{status}</span> : null}
      </div>

      {input !== undefined ? <ToolLogField label="Input" value={input} /> : null}
      {output !== undefined ? <ToolLogField label="Output" value={output} /> : null}
      {error !== undefined ? <ToolLogField label="Error" value={error} /> : null}

      {input === undefined && output === undefined && error === undefined ? (
        <p className="mt-3 text-sm text-text-secondary">No tool details recorded.</p>
      ) : null}
    </section>
  );
}

function ToolLogField(props: { label: string; value: unknown }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <pre className="mt-1 overflow-auto rounded-md border border-border bg-surface p-3 text-xs leading-6 text-text-primary whitespace-pre-wrap">
        {formatToolLogValue(props.value)}
      </pre>
    </div>
  );
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

function readResultMessageCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;

  const messageCount = (value as Record<string, unknown>)["messageCount"];
  return typeof messageCount === "number" ? messageCount : undefined;
}

function isToolPart(part: ConversationPart): boolean {
  return part.type === "tool" || part.type === "tool_call";
}

function readToolName(part: ConversationPart): string {
  const value = part["tool"] ?? part["name"];
  return typeof value === "string" && value.trim() ? value : "Tool";
}

function readToolStatus(part: ConversationPart): string | undefined {
  const state = readToolState(part);
  const status = state?.["status"];

  return typeof status === "string" && status.trim() ? status : undefined;
}

function readToolStateField(part: ConversationPart, key: string): unknown {
  return readToolState(part)?.[key];
}

function readToolState(part: ConversationPart): Record<string, unknown> | undefined {
  const state = part["state"];
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : undefined;
}

function formatToolLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
