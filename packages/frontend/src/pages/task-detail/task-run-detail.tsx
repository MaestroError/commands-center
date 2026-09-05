// Split out of TaskDetailPage.tsx (issue #99).

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/PageStates";
import { TabBar } from "@/components/common/TabBar";
import { RunReplyPanel } from "@/components/tasks/task-feedback-section";
import { formatDate, formatToken, readAgentName } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import { useTaskMutations, useTaskRunQuery, useTaskRunSessionQuery } from "@/hooks/use-tasks-query";
import type {
  ConversationMessage,
  ConversationPart,
  Specialist,
  Task,
  TaskPermissionProfile,
  TaskRun,
  TaskSubtask,
} from "@cc/shared/schemas";
import { Fragment, type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  formatRunDuration,
  formatRunTarget,
  formatToolLogValue,
  isToolPart,
  readError,
  readResultMessageCount,
  readToolName,
  readToolStateField,
  readToolStatus,
} from "./task-detail-helpers";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";

export function RunHistory(props: {
  taskId: string;
  runs: TaskRun[];
  agents?: Specialist[];
  subtasks?: TaskSubtask[];
  isLoading: boolean;
  error: unknown;
}) {
  const [openReplyRunId, setOpenReplyRunId] = useState<string>();
  const [openChatError, setOpenChatError] = useState<string>();
  const navigate = useNavigate();
  const mutations = useTaskMutations();

  return (
    <section className="cc-panel min-w-0 p-5">
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
      {openChatError ? (
        <ErrorState description={openChatError} title="Chat could not be opened." />
      ) : null}
      {!props.isLoading && props.runs.length === 0 ? (
        <EmptyState
          description="Manual and scheduled executions will appear here after the task runs."
          title="No runs yet"
        />
      ) : null}
      {props.runs.length > 0 ? (
        <div className="mt-4 max-w-full overflow-x-auto">
          <table className="w-full min-w-[72rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-text-secondary">
              <tr className="border-b border-border">
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 pr-3">Specialist</th>
                <th className="py-3 pr-3">Outcome</th>
                <th className="py-3 pr-3">Trigger</th>
                <th className="py-3 pr-3">Target</th>
                <th className="py-3 pr-3">Started</th>
                <th className="py-3 pr-3">Duration</th>
                <th className="py-3 pr-3">Artifacts</th>
                <th className="py-3 pr-3">Session</th>
                <th className="py-3 pr-3">Summary</th>
                <th className="py-3 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {props.runs.map((run) => (
                <Fragment key={run.id}>
                  <tr className="border-b border-border/70" data-testid={`task-run-row-${run.id}`}>
                    <td className="py-3 pr-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {readAgentName(props.agents ?? [], run.agentId)}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {run.outcome ? formatToken(run.outcome) : "-"}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {formatToken(run.triggerSource)}
                    </td>
                    <td className="max-w-48 truncate py-3 pr-3 text-text-secondary">
                      {formatRunTarget(run, props.subtasks ?? [])}
                    </td>
                    <td className="py-3 pr-3 text-text-secondary">{formatDate(run.startedAt)}</td>
                    <td className="py-3 pr-3 text-text-secondary">{formatRunDuration(run)}</td>
                    <td className="py-3 pr-3 text-text-secondary">{run.artifacts.length}</td>
                    <td className="py-3 pr-3 text-text-secondary">
                      {run.conversation?.convertedAt
                        ? "Continued in chat"
                        : run.opencodeSessionId
                          ? "Recorded"
                          : "Unavailable"}
                    </td>
                    <td className="max-w-sm truncate py-3 pr-3 text-text-secondary">
                      {run.finalMessage ?? run.errorMessage ?? "No summary"}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className={buttonVariants({ variant: "secondary" })}
                          data-testid={`task-run-inspect-${run.id}`}
                          to={`/tasks/${props.taskId}/runs/${run.id}`}
                        >
                          Inspect
                        </Link>
                        {run.conversation?.convertedAt ? (
                          <Button
                            variant="secondary"
                            data-testid={`task-run-open-chat-${run.id}`}
                            disabled={
                              !props.agents?.some(
                                (agent) => agent.id === run.agentId && Boolean(agent.slug),
                              ) || mutations.openInChat.isPending
                            }
                            onClick={() => void openRunChat(run)}
                            type="button"
                          >
                            {mutations.openInChat.isPending ? "Opening..." : "Open chat"}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            data-testid={`task-run-reply-${run.id}`}
                            disabled={!run.opencodeSessionId}
                            onClick={() =>
                              setOpenReplyRunId((current) =>
                                current === run.id ? undefined : run.id,
                              )
                            }
                            title={
                              run.opencodeSessionId
                                ? undefined
                                : "Replies require a recorded OpenCode session."
                            }
                            type="button"
                          >
                            Reply
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {openReplyRunId === run.id ? (
                    <tr className="border-b border-border/70">
                      <td className="py-3 pr-3" colSpan={11}>
                        <RunReplyPanel
                          agent={(props.agents ?? []).find((entry) => entry.id === run.agentId)}
                          run={run}
                          taskId={props.taskId}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );

  async function openRunChat(run: TaskRun): Promise<void> {
    const agentSlug = props.agents?.find((entry) => entry.id === run.agentId)?.slug;
    if (!agentSlug) return;

    setOpenChatError(undefined);
    try {
      const snapshot = await mutations.openInChat.mutateAsync({
        taskId: props.taskId,
        runId: run.id,
      });
      void navigate(
        `/chat/${encodeURIComponent(agentSlug)}/${encodeURIComponent(snapshot.current.id)}`,
      );
    } catch (error) {
      setOpenChatError(readError(error));
    }
  }
}

export function TaskRunDetail(props: {
  task?: Task;
  taskId?: string;
  runId?: string;
  agents?: Specialist[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const runQuery = useTaskRunQuery(props.taskId, props.runId);
  const sessionQuery = useTaskRunSessionQuery(props.taskId, props.runId);
  const mutations = useTaskMutations();
  const [activeTabId, setActiveTabId] = useState<"session" | "details">("session");
  const [openChatError, setOpenChatError] = useState<string>();
  const run = runQuery.data;
  const agentSlug = props.agents?.find(
    (entry) => entry.id === (run?.agentId ?? props.task?.agentId),
  )?.slug;
  const convertedConversation = run?.conversation?.convertedAt;

  return (
    <div className="grid gap-4" data-testid="task-run-inspector">
      <PageHeader
        actions={
          <>
            <Link
              className={buttonVariants({ variant: "secondary" })}
              to={
                props.taskId
                  ? `/tasks/${props.taskId}${location.search}`
                  : `/tasks${location.search}`
              }
            >
              Back to task
            </Link>
            {(convertedConversation || sessionQuery.data?.canOpenInChat) &&
            props.taskId &&
            props.runId ? (
              <Button
                disabled={!agentSlug || mutations.openInChat.isPending}
                onClick={() => void openInChat()}
                type="button"
              >
                {mutations.openInChat.isPending
                  ? "Opening..."
                  : convertedConversation
                    ? "Open chat"
                    : "Continue in chat"}
              </Button>
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
      {openChatError ? (
        <ErrorState description={openChatError} title="Chat could not be opened." />
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
              testIdPrefix="task-run-tab"
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
            {convertedConversation ? (
              <Metric label="Chat" value={`Continued ${formatDate(convertedConversation)}`} />
            ) : null}
            {run.errorMessage ? <TextBlock label="Error" value={run.errorMessage} /> : null}
            <JsonBlock label="Error details" value={run.errorDetails} />
          </aside>
        </section>
      ) : null}
    </div>
  );

  async function openInChat(): Promise<void> {
    if (!props.taskId || !props.runId || !agentSlug) return;

    setOpenChatError(undefined);
    try {
      const snapshot = await mutations.openInChat.mutateAsync({
        taskId: props.taskId,
        runId: props.runId,
      });
      void navigate(
        `/chat/${encodeURIComponent(agentSlug)}/${encodeURIComponent(snapshot.current.id)}`,
      );
    } catch (error) {
      setOpenChatError(readError(error));
    }
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
          value={props.run.finalMessage ?? props.run.errorMessage ?? "No summary"}
        />
        <Metric label="Result" value={props.run.resultText ?? "No result text set."} />
        <Metric
          label="Human review"
          value={
            props.run.needsHumanReview
              ? (props.run.humanReviewReason ?? "Required")
              : "Not required"
          }
        />
        <JsonBlock label="Artifacts" value={props.run.artifacts} />
        <Metric label="Messages" value={String(messageCount)} />
        {props.diagnostics.length ? (
          <JsonBlock label="Session diagnostics" value={props.diagnostics} />
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <button
          aria-expanded={logOpen}
          className="flex w-full items-start justify-between gap-3 text-left"
          data-testid="task-run-session-log"
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
  const [promptOpen, setPromptOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <div className="grid gap-5">
      <CollapsibleRunContextBlock
        isOpen={promptOpen}
        label="Rendered prompt"
        onToggle={() => setPromptOpen((current) => !current)}
      >
        <TextBlock value={props.run.renderedPrompt || "No prompt recorded."} code />
      </CollapsibleRunContextBlock>
      <CollapsibleRunContextBlock
        isOpen={contextOpen}
        label="Rendered context"
        onToggle={() => setContextOpen((current) => !current)}
      >
        <JsonBlock value={props.run.renderedContext} />
      </CollapsibleRunContextBlock>
      <TextBlock label="Result text" value={props.run.resultText ?? "No result text set."} />
      <JsonBlock label="Artifacts" value={props.run.artifacts} />
      <Metric
        label="Human review"
        value={
          props.run.needsHumanReview ? (props.run.humanReviewReason ?? "Required") : "Not required"
        }
      />
      <JsonBlock label="Result" value={props.run.result} />
      <JsonBlock label="Effective permissions" value={props.run.effectivePermissions} />
      {props.diagnostics.length ? (
        <JsonBlock label="Session diagnostics" value={props.diagnostics} />
      ) : null}
    </div>
  );
}

function CollapsibleRunContextBlock(props: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <button
        aria-expanded={props.isOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={props.onToggle}
        type="button"
      >
        <span className="font-semibold text-text-primary">{props.label}</span>
        <span className="text-sm text-text-secondary">{props.isOpen ? "Hide" : "Show"}</span>
      </button>
      {props.isOpen ? <div className="mt-3">{props.children}</div> : null}
    </section>
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

export function PermissionSummary(props: { profile?: TaskPermissionProfile }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold text-text-primary">Permission summary</h2>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {props.profile
          ? `Custom tools: ${String(props.profile.customTools?.length ?? 0)}. External MCP: ${String(props.profile.mcpServers?.length ?? 0)}. App MCP: ${String(props.profile.appMcpServers?.length ?? 0)}.`
          : "Inherits the assigned specialist permissions. Each run stores its effective permission snapshot."}
      </p>
    </section>
  );
}

export function TextBlock(props: { label?: string; value: string; code?: boolean }) {
  return (
    <section>
      {props.label ? <h2 className="font-semibold text-text-primary">{props.label}</h2> : null}
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

function JsonBlock(props: { label?: string; value: unknown }) {
  if (props.value === undefined) return null;
  return <TextBlock label={props.label} value={JSON.stringify(props.value, null, 2)} code />;
}

export function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">{props.label}</p>
      <p className="mt-1 break-words font-medium text-text-primary">{props.value}</p>
    </div>
  );
}
