import type { ConversationDetail, TaskRun, TaskRunFollowup } from "@cc/shared/schemas";
import { BadRequestError, NotFoundError } from "../../lib/api-error.js";
import { createTaskReplyQueueService } from "../task-reply-queue-service.js";
import { mergeOpencodeMonitorMetadata } from "../task-run-support.js";
import { mapTaskRunFollowup } from "../task-service/mappers.js";
import type { TaskExecutionServiceOptions } from "./context.js";

export function createTaskReplyFlow(ctx: {
  options: TaskExecutionServiceOptions;
  findRun: (id: string) => Promise<TaskRun>;
  scheduleAgentDrain: (agentId: string) => void;
  startMonitor: (runId: string) => void;
}) {
  const { options, findRun, scheduleAgentDrain, startMonitor } = ctx;
  const queue = options.db ? createTaskReplyQueueService(options.db) : undefined;

  async function sendRunReply(runId: string, input: unknown): Promise<TaskRunFollowup> {
    if (!queue || !options.conversationService)
      throw new Error("Task reply services are unavailable.");
    const run = await findRun(runId);
    queue.assertTarget(run);
    const followup = await options.taskService.insertFollowup(run, input);
    scheduleAgentDrain(run.agentId);
    return followup;
  }

  async function sendTaskReply(taskId: string, input: unknown): Promise<TaskRunFollowup> {
    const reply = await options.taskService.insertFollowup({ taskId }, input);
    if (reply.runId) scheduleAgentDrain((await findRun(reply.runId)).agentId);
    return reply;
  }

  async function continueRun(runId: string): Promise<TaskRun> {
    if (!queue || !options.conversationService)
      throw new Error("Task reply services are unavailable.");
    const run = await findRun(runId);
    if (run.status !== "cancelled")
      throw new BadRequestError("Only stopped executions need explicit continuation.");
    if (!run.opencodeSessionId)
      throw new BadRequestError(
        "This execution has no session. Duplicate the task to start again.",
      );
    const inspection = await options.conversationService.inspectTaskRunConversation(
      run.taskId,
      run.id,
    );
    if (!inspection.conversation)
      throw new BadRequestError("The session is unavailable. Restore it or duplicate the task.");
    if (run.subtaskId) {
      const child = (await options.taskService.listSubtasks(run.taskId)).find(
        (child) => child.id === run.subtaskId,
      );
      const owner = child?.ownerRunId ? await findRun(child.ownerRunId) : undefined;
      if (!owner || ["cancelled", "skipped"].includes(owner.status))
        throw new BadRequestError("Continue the owner execution before continuing an assignment.");
    }
    queue.assertTarget({ ...run, status: "error" });
    const resumed = await options.taskService.setRunStatus(run.id, "error", {
      errorMessage: "Execution resumed. Queue a reply to continue.",
    });
    if (!resumed) throw new NotFoundError("Task run not found.");
    return resumed;
  }

  function cancelTaskReply(taskId: string, id: string): TaskRunFollowup {
    if (!queue) throw new Error("Task reply services are unavailable.");
    return queue.cancelForTask(id, taskId);
  }

  async function dispatchNextReply(agentId: string, before?: string): Promise<boolean> {
    if (!queue || !options.conversationService) return false;
    const candidate = queue.next(agentId);
    if (!candidate) return false;
    const eligibleAt = Math.max(
      candidate.reply.created_at.getTime(),
      candidate.run.completed_at?.getTime() ?? 0,
    );
    if (before && eligibleAt > Date.parse(before)) return false;
    const { reply } = candidate;
    let run = await findRun(candidate.run.id);
    try {
      queue.assertTarget(run);
      if (!run.opencodeSessionId)
        throw new BadRequestError(
          "The run has no recoverable session. Duplicate the task to start again.",
        );
      const inspection = await options.conversationService.inspectTaskRunConversation(
        run.taskId,
        run.id,
      );
      if (!inspection.conversation)
        throw new NotFoundError(
          "Task run session is unavailable. Restore the session or duplicate the task.",
        );
      if (!queue.claim(reply.id, run, inspection.conversation.messageCount)) return false;
      run = await findRun(run.id);
      const payload = queue.payload(reply.id);
      try {
        const started = await options.conversationService.startTaskRunPrompt(
          inspection.conversation.id,
          {
            text: payload.body,
            attachments: payload.attachments,
            model: payload.model ?? run.model,
          },
        );
        await options.taskService.updateRun(run.id, {
          triggerMetadata: mergeOpencodeMonitorMetadata(run.triggerMetadata, started),
        });
        queue.accept(reply.id);
        const current = await findRun(run.id);
        if (current.status === "running") startMonitor(run.id);
        else await finalizeReply(current);
      } catch (error) {
        const current = await findRun(run.id);
        if (current.status !== "running" || current.triggerMetadata?.["replyId"] !== reply.id) {
          await finalizeReply(current);
          return true;
        }
        if (!(await recoverReply(current))) {
          queue.block(
            reply.id,
            `Delivery could not be confirmed: ${error instanceof Error ? error.message : "unknown error"}. Inspect this session before retrying.`,
          );
          await options.taskService.updateRun(run.id, {
            errorMessage:
              "Reply delivery needs attention. Inspect the session, then cancel the run before retrying.",
          });
        }
      }
    } catch (error) {
      queue.block(
        reply.id,
        error instanceof Error ? error.message : "Reply destination is unavailable.",
      );
    }
    return true;
  }

  async function recoverReply(run: TaskRun): Promise<boolean> {
    if (
      !queue ||
      !options.conversationService ||
      typeof run.triggerMetadata?.["replyId"] !== "string"
    )
      return false;
    const reply = queue.get(run.triggerMetadata["replyId"]);
    if (!reply || run.status !== "running" || !["delivering", "sending"].includes(reply.status))
      return false;
    if (reply.status === "sending") {
      startMonitor(run.id);
      return true;
    }
    let conversation: ConversationDetail;
    try {
      conversation = await options.conversationService.syncTaskRunConversation(run.taskId, run.id);
    } catch (error) {
      options.logger?.warn({ err: error, runId: run.id }, "cannot reconcile queued reply delivery");
      return false;
    }
    const messages = conversation.messages.slice(
      reply.baseline_message_count ?? conversation.messages.length,
    );
    if (!messages.some((message) => message.role === "user" && message.content === reply.body))
      return false;
    await options.taskService.updateRun(run.id, {
      triggerMetadata: mergeOpencodeMonitorMetadata(run.triggerMetadata, {
        conversationId: conversation.id,
        opencodeSessionId: conversation.opencodeSessionId,
        attemptedModel: queue.payload(reply.id).model ?? run.model ?? "unknown",
        baselineMessageCount: reply.baseline_message_count ?? 0,
        promptAcceptedAt: reply.delivery_started_at?.toISOString() ?? new Date().toISOString(),
      }),
    });
    queue.accept(reply.id);
    startMonitor(run.id);
    return true;
  }

  async function recoverPending(): Promise<void> {
    if (!queue || !options.db) return;
    const accepted = await options.db.query.task_run_followups.findMany({
      where: (table, { eq }) => eq(table.status, "sending"),
    });
    for (const reply of accepted) {
      if (!reply.run_id) continue;
      const run = await findRun(reply.run_id);
      if (!["running", "queued"].includes(run.status)) await finalizeReply(run);
    }
    const delivering = await options.db.query.task_run_followups.findMany({
      where: (table, { eq }) => eq(table.status, "delivering"),
    });
    for (const reply of delivering) {
      if (!reply.run_id) continue;
      const run = await findRun(reply.run_id);
      if (run.status === "cancelled") {
        await finalizeReply(run);
        continue;
      }
      if (!(await recoverReply(run))) {
        queue.block(
          reply.id,
          "Delivery was interrupted and acceptance is uncertain. Inspect the session before retrying.",
        );
        await options.taskService.updateRun(run.id, {
          errorMessage:
            "Reply delivery needs attention. Inspect the session, then cancel the run before retrying.",
        });
      }
    }
    for (const { agentId } of queue.pendingAgents()) scheduleAgentDrain(agentId);
  }

  function cancelRunReply(runId: string, id: string): TaskRunFollowup {
    if (!queue) throw new Error("Task reply services are unavailable.");
    return queue.cancel(id, runId);
  }

  function cancelPending(runId: string): void {
    queue?.cancelPending(runId);
  }

  async function finalizeReply(run: TaskRun): Promise<void> {
    if (!queue) return;
    const id = run.triggerMetadata?.["replyId"];
    if (typeof id !== "string") return;
    const reply = queue.get(id);
    if (!reply || reply.run_id !== run.id || !["delivering", "sending"].includes(reply.status))
      return;
    const latest = await findRun(run.id);
    if (latest.startedAt !== run.startedAt || latest.status !== run.status) return;
    queue.accept(id);
    if (run.status === "completed" || run.status === "waiting") {
      await options.taskService.markFollowupAnswered(id, {
        answerBody: run.resultText ?? run.finalMessage ?? "No response text.",
        answeredAt: run.completedAt ?? new Date().toISOString(),
      });
    } else {
      await options.taskService.markFollowupFailed(
        id,
        run.errorMessage ?? `Run ended (${run.status}) before answering.`,
      );
    }
  }

  return {
    sendRunReply,
    sendTaskReply,
    continueRun,
    cancelTaskReply,
    dispatchNextReply,
    recoverPending,
    recoverReply,
    cancelRunReply,
    cancelPending,
    finalizeReply,
    readReply: (id: string) => {
      const reply = queue?.get(id);
      return reply ? mapTaskRunFollowup(reply) : undefined;
    },
  };
}
