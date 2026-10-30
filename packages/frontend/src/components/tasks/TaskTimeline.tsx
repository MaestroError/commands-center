import { useState } from "react";
import { Link } from "react-router";
import type { Specialist, Task, TaskRun } from "@cc/shared/schemas";
import {
  useTaskMutations,
  useTaskRepliesQuery,
  useTaskSubtasksQuery,
} from "@/hooks/use-tasks-query";
import { useSpecialistCatalogQuery } from "@/hooks/use-specialists-query";
import { useTaskComposerSkills } from "@/pages/tasks/task-helpers";
import { Button } from "@/components/ui/button";
import { TaskPromptComposer } from "./TaskPromptComposer";
import { buildTaskPromptText, createTaskPromptValue } from "./task-prompt";
import { FeedbackComment } from "./TaskTimelineComment";
import { buildTaskTimeline } from "./task-timeline";
import { StatusBadge } from "./task-ui";
import { formatDate } from "./task-format";

export function TaskTimeline(props: {
  task: Task;
  taskId: string;
  agent?: Specialist;
  agents: Specialist[];
  runs: TaskRun[];
}) {
  const replies = useTaskRepliesQuery(props.taskId);
  const assignments = useTaskSubtasksQuery(props.taskId);
  const catalog = useSpecialistCatalogQuery();
  const skills = useTaskComposerSkills(props.agent, catalog.data);
  const mutations = useTaskMutations();
  const [prompt, setPrompt] = useState(() => createTaskPromptValue());
  const [request, setRequest] = useState<{ body: string; id: string }>();
  const [error, setError] = useState<string>();
  const root = props.runs.find((run) => !run.subtaskId);
  const stopped = root?.status === "cancelled";
  const disabled = props.task.archived || stopped || root?.status === "skipped";
  const entries = buildTaskTimeline(props.runs, replies.data ?? [], assignments.data ?? []);

  async function submit(): Promise<void> {
    const body = buildTaskPromptText(prompt);
    if (!body || disabled) return;
    const id = request?.body === body ? request.id : crypto.randomUUID();
    setRequest({ body, id });
    setError(undefined);
    try {
      await mutations.sendTaskReply.mutateAsync({
        taskId: props.taskId,
        input: { body, kind: "operator_reply", requestId: id, attachments: [] },
      });
      setPrompt(createTaskPromptValue());
      setRequest(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Reply could not be saved.");
    }
  }

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-surface p-5"
      aria-label="Task timeline"
      data-testid="task-timeline"
    >
      <h2>Task timeline</h2>
      <p className="text-sm text-text-secondary">
        Replies go to the task owner. Assignments keep each teammate’s own session.
      </p>
      {root && (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={root.status} />
          <Link className="text-accent underline" to={`/tasks/${props.taskId}/runs/${root.id}`}>
            Open owner session
          </Link>
          {["running", "queued", "waiting"].includes(root.status) && (
            <Button
              variant="secondary"
              onClick={() => mutations.cancelRun.mutate({ taskId: props.taskId, runId: root.id })}
            >
              Stop task
            </Button>
          )}
          {stopped && (
            <Button
              disabled={mutations.continueRun.isPending || props.task.archived}
              onClick={() => mutations.continueRun.mutate({ taskId: props.taskId, runId: root.id })}
            >
              Continue execution
            </Button>
          )}
        </div>
      )}
      {root?.status === "waiting" && <p>Waiting for assignment results or owner acceptance.</p>}
      {(replies.isLoading || assignments.isLoading) && <p>Loading task history…</p>}
      {(replies.error ?? assignments.error) && (
        <p role="alert">Task history could not be loaded.</p>
      )}
      <ol className="grid list-none gap-3 p-0" aria-label="Task activity">
        {entries.map((entry) => (
          <li key={entry.id}>
            <FeedbackComment
              author={
                entry.agentId
                  ? `${props.agents.find((agent) => agent.id === entry.agentId)?.name ?? entry.agentId} · ${entry.title}`
                  : entry.title
              }
              agent={props.agents.find((agent) => agent.id === entry.agentId)}
              body={entry.body}
              tone={entry.agentId ? "agent" : "operator"}
              artifacts={entry.id.startsWith("outcome:") ? entry.run?.artifacts : undefined}
              taskId={props.taskId}
              meta={
                <>
                  <span>{formatDate(entry.at)}</span>
                  {entry.reply && <StatusBadge status={entry.statusLabel ?? entry.reply.status} />}
                </>
              }
            >
              {entry.run?.subtaskId && (
                <Link
                  className="text-sm text-accent underline"
                  to={`/tasks/${props.taskId}/runs/${entry.run.id}`}
                >
                  Open assignment session
                </Link>
              )}
              {entry.assignment && (
                <details className="mt-2">
                  <summary>
                    Assignment progress ·{" "}
                    {entry.assignment.acceptedAt ? "Accepted" : (entry.run?.status ?? "Preparing")}
                  </summary>
                  <p>Revisions: {entry.assignment.revisionCount ?? 0}</p>
                  {entry.run && ["running", "queued", "waiting"].includes(entry.run.status) && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        mutations.cancelRun.mutate({ taskId: props.taskId, runId: entry.run!.id })
                      }
                    >
                      Stop assignment
                    </Button>
                  )}
                </details>
              )}
              {entry.reply && (
                <div className="mt-2 text-sm text-text-secondary">
                  {!entry.reply.runId && entry.reply.status === "queued" && (
                    <p>Waiting for the task’s first execution.</p>
                  )}
                  {entry.reply.waitingReason && entry.reply.runId && (
                    <p>{entry.reply.waitingReason}</p>
                  )}
                  {entry.reply.errorMessage && <p role="alert">{entry.reply.errorMessage}</p>}
                  {["operator_reply", "review_answer"].includes(entry.reply.kind) &&
                    (entry.reply.status === "queued" ||
                      (entry.reply.status === "blocked" && !entry.reply.deliveryStartedAt)) && (
                      <Button
                        variant="secondary"
                        disabled={mutations.cancelTaskReply.isPending}
                        onClick={() =>
                          mutations.cancelTaskReply.mutate({
                            taskId: props.taskId,
                            id: entry.reply!.id,
                          })
                        }
                      >
                        Cancel queued reply
                      </Button>
                    )}
                </div>
              )}
            </FeedbackComment>
          </li>
        ))}
      </ol>
      {!entries.length && (
        <p>No activity yet. Replies saved now will be delivered after the first task turn.</p>
      )}
      {stopped && (
        <p>
          Continue the stopped execution before replying. Previous cancelled messages and
          assignments will not restart automatically.
        </p>
      )}
      {!disabled && (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TaskPromptComposer
            agentId={root?.agentId ?? props.task.agentId}
            label="Reply to task owner"
            skills={skills}
            value={prompt}
            onChange={setPrompt}
            placeholder="Add instructions or feedback for the task owner."
            testId="task-reply-input"
          />
          <Button
            className="w-fit"
            type="submit"
            data-testid="task-reply-send"
            disabled={!buildTaskPromptText(prompt) || mutations.sendTaskReply.isPending}
          >
            {mutations.sendTaskReply.isPending ? "Saving…" : "Queue reply"}
          </Button>
        </form>
      )}
      {(error ??
        mutations.continueRun.error?.message ??
        mutations.cancelRun.error?.message ??
        mutations.cancelTaskReply.error?.message) && (
        <p role="alert">
          {error ??
            mutations.continueRun.error?.message ??
            mutations.cancelRun.error?.message ??
            mutations.cancelTaskReply.error?.message}
        </p>
      )}
    </section>
  );
}
