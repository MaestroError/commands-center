// Row mappers and JSON parse/normalize helpers, split out of task-service.ts (issue #99).

import {
  MAX_FALLBACK_MODELS,
  artifactSchema,
  fallbackModelsSchema,
  recurringTaskScheduleSchema,
  reviewQuestionSchema,
  taskContextInputSchema,
  taskContextSchema,
  taskPermissionProfileSchema,
  taskRunFollowupSchema,
  taskRunSchema,
  taskSchema,
  taskSubtaskSchema,
  taskTemplateSchema,
  taskTodoInputSchema,
  taskTodoSchema,
  type Artifact,
  type ArtifactShareLink,
  type Task,
  type TaskContext,
  type TaskRun,
  type TaskRunFollowup,
  type TaskSubtask,
  type TaskTemplate,
  type TaskTodo,
} from "@cc/shared/schemas";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "../../db/client.js";
import { createId } from "../../db/ids.js";
import {
  agents,
  artifact_share_links,
  artifacts as artifactsTable,
  conversations as conversationsTable,
  task_run_followups,
  type task_runs,
  type task_subtasks,
  type task_templates,
  tasks,
} from "../../db/schema/index.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import { resolveArtifactFileManagerPath } from "../artifact-service.js";
import {
  deriveRunSubtaskStatus,
  deriveSubtaskStatus,
  deriveTaskRunRuntimeState,
} from "./status.js";
import { parseMcpConfigOrDefault } from "./template-mcp-config.js";

export function generatedTasksForTemplateFilter(templateId: string) {
  return and(
    or(
      and(eq(tasks.template_id, templateId), ne(tasks.id, templateId)),
      eq(tasks.source_template_id, templateId),
    ),
    isNull(tasks.deleted_at),
  );
}

export function taskGenerationSourceLetter(triggerSource: TaskRun["triggerSource"]): string {
  if (triggerSource === "manual") return "M";
  if (triggerSource === "api") return "A";
  if (triggerSource === "scheduled" || triggerSource === "template") return "S";
  if (triggerSource === "agent") return "G";
  return "Y";
}

export function normalizeTodos(input: unknown[], timestamp: Date): TaskTodo[] {
  return input.map((todo) => {
    const parsed = taskTodoInputSchema.parse(todo);
    const createdAt = parsed.createdAt ?? timestamp.toISOString();
    const completedAt =
      parsed.status === "completed" ? (parsed.completedAt ?? timestamp.toISOString()) : undefined;

    return taskTodoSchema.parse({
      ...parsed,
      id: parsed.id ?? createId(),
      createdAt,
      completedAt,
    });
  });
}

export function isRunningAgentConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("task_runs_agent_running_unique_idx") ||
      error.message.includes("UNIQUE constraint failed: task_runs.agent_id"))
  );
}

export function mapTask(row: typeof tasks.$inferSelect): Task {
  return taskSchema.parse({
    id: row.id,
    templateId: row.template_id ?? undefined,
    agentId: row.agent_id,
    defaultAgentId: row.default_agent_id ?? undefined,
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    title: row.title,
    description: row.description,
    context: parseTaskContext(row.context),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestFinalMessage: row.latest_final_message ?? undefined,
    latestResultText: row.latest_result_text ?? undefined,
    latestRunId: row.latest_run_id ?? undefined,
    sourceTemplateId: row.source_template_id ?? undefined,
    generatedByAgentId: row.generated_by_agent_id ?? undefined,
    sourceOccurrenceAt: row.source_occurrence_at?.toISOString(),
    scheduledAt: row.scheduled_at?.toISOString(),
    scheduledFor: row.scheduled_for?.toISOString(),
    dueAt: row.due_at?.toISOString(),
    doneAt: row.done_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

export function mapTemplateAsTask(row: typeof task_templates.$inferSelect): Task {
  return taskSchema.parse({
    id: row.id,
    templateId: row.id,
    agentId: row.agent_id,
    defaultAgentId: row.default_agent_id ?? undefined,
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    title: row.title,
    description: row.description,
    context: normalizeTaskContext(),
    todos: parseTaskTodos(row.todos_json),
    status: row.status,
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    enabled: row.enabled,
    archived: row.archived,
    latestFinalMessage: row.latest_final_message ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString(),
  });
}

export function mapTaskTemplate(row: typeof task_templates.$inferSelect): TaskTemplate {
  return taskTemplateSchema.parse({
    id: row.id,
    defaultAgentId: row.default_agent_id ?? row.agent_id,
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    title: row.title,
    description: row.description,
    todos: parseTaskTodos(row.todos_json),
    recurrence: row.recurrence_json
      ? recurringTaskScheduleSchema.parse(JSON.parse(row.recurrence_json))
      : undefined,
    permissionProfile: parseOptional(row.permission_profile_json, taskPermissionProfileSchema),
    mcpConfig: parseMcpConfigOrDefault(row.mcp_config_json, row.title),
    enabled: row.enabled,
    latestFinalMessage: row.latest_final_message ?? undefined,
    latestTaskId: row.latest_task_id ?? undefined,
    nextOccurrenceAt: row.next_occurrence_at?.toISOString(),
    lastGeneratedOccurrenceAt: row.last_generated_occurrence_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

export function mapTaskSubtask(row: typeof task_subtasks.$inferSelect): TaskSubtask {
  return taskSubtaskSchema.parse({
    id: row.id,
    taskId: row.task_id,
    feedbackId: row.feedback_id ?? undefined,
    agentId: row.agent_id,
    description: row.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

export function mapSubtaskDetail(subtask: TaskSubtask, runs: TaskRun[]) {
  const subtaskRuns = runs.filter((run) => run.subtaskId === subtask.id);
  const replies = [...subtaskRuns]
    .reverse()
    .map((run) => ({ run, status: deriveRunSubtaskStatus(run) }));

  return {
    ...subtask,
    status: deriveSubtaskStatus(subtask, runs),
    latestRun: subtaskRuns[0],
    replies,
  };
}

export function mapTaskRun(row: typeof task_runs.$inferSelect): TaskRun {
  const triggerMetadata = parseJsonRecord(row.trigger_metadata_json);
  return taskRunSchema.parse({
    id: row.id,
    taskId: row.task_id,
    subtaskId: row.subtask_id ?? undefined,
    agentId: row.agent_id,
    model: row.model ?? undefined,
    fallbackModels: parseFallbackModels(row.fallback_models),
    retryOfRunId: row.retry_of_run_id ?? undefined,
    opencodeSessionId: row.opencode_session_id ?? undefined,
    status: row.status,
    runtimeState: deriveTaskRunRuntimeState(row.status, triggerMetadata),
    triggerSource: row.trigger_source,
    outcome: row.outcome ?? undefined,
    renderedPrompt: row.rendered_prompt,
    context: parseJsonRecord(row.context_json),
    triggerMetadata,
    renderedContext: parseJsonRecord(row.rendered_context_json),
    effectivePermissions: parseOptional(
      row.effective_permissions_json,
      taskPermissionProfileSchema,
    ),
    finalMessage: row.final_message ?? undefined,
    resultText: row.result_text ?? undefined,
    initialOutcomeText: row.initial_outcome_text ?? undefined,
    initialOutcomeAt: row.initial_outcome_at?.toISOString(),
    // Artifacts are conversation-anchored and attached during the async
    // enrichment step (mapTaskRunsWithReplyState); the base mapping leaves the
    // schema default of [].
    needsHumanReview: row.needs_human_review ?? false,
    humanReviewReason: row.human_review_reason ?? undefined,
    reviewQuestion: parseOptional(row.review_question_json, reviewQuestionSchema),
    result: parseJsonRecord(row.result_json),
    errorMessage: row.error_message ?? undefined,
    errorDetails: parseJsonRecord(row.error_details_json),
    startedAt: row.started_at?.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    cancellationReason: row.cancellation_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}

export function mapTaskRunFollowup(row: typeof task_run_followups.$inferSelect): TaskRunFollowup {
  return taskRunFollowupSchema.parse({
    id: row.id,
    taskId: row.task_id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    answerBody: row.answer_body ?? undefined,
    answeredAt: row.answered_at?.toISOString(),
    errorMessage: row.error_message ?? undefined,
  });
}

export async function mapTaskRunWithReplyState(
  db: AppDb,
  config: RuntimeConfig,
  row: typeof task_runs.$inferSelect,
): Promise<TaskRun> {
  const [run] = await mapTaskRunsWithReplyState(db, config, [row]);
  return run ?? mapTaskRun(row);
}

export async function mapTaskRunsWithReplyState(
  db: AppDb,
  config: RuntimeConfig,
  rows: Array<typeof task_runs.$inferSelect>,
): Promise<TaskRun[]> {
  const runs = rows.map(mapTaskRun);
  if (runs.length === 0) {
    return runs;
  }

  const runIds = runs.map((run) => run.id);
  const [activeReplyRunIds, artifactsByRunId] = await Promise.all([
    getActiveReplyRunIds(db, runIds),
    getArtifactsByRunIds(db, config, runIds),
  ]);

  return runs.map((run) => ({
    ...run,
    hasActiveReply: activeReplyRunIds.has(run.id),
    artifacts: artifactsByRunId.get(run.id) ?? [],
  }));
}

// Load each run's conversation-anchored artifacts (with active share links),
// keyed by run id. A run maps 1:1 to its task-run conversation.

export async function getArtifactsByRunIds(
  db: AppDb,
  config: RuntimeConfig,
  runIds: string[],
): Promise<Map<string, Artifact[]>> {
  const grouped = new Map<string, Artifact[]>();
  const uniqueRunIds = Array.from(new Set(runIds.filter(Boolean)));

  if (uniqueRunIds.length === 0) {
    return grouped;
  }

  const rows = await db
    .select({
      runId: conversationsTable.task_run_id,
      artifact: artifactsTable,
      agentSlug: agents.slug,
    })
    .from(artifactsTable)
    .innerJoin(conversationsTable, eq(artifactsTable.conversation_id, conversationsTable.id))
    .innerJoin(agents, eq(conversationsTable.agent_id, agents.id))
    .where(inArray(conversationsTable.task_run_id, uniqueRunIds))
    .orderBy(desc(artifactsTable.created_at));

  const shareLinks = await getShareLinksByArtifactIds(
    db,
    rows.map((row) => row.artifact.id),
  );

  const mappedRows = await Promise.all(
    rows.map(async ({ runId, artifact, agentSlug }) => {
      if (!runId) {
        return undefined;
      }
      return {
        runId,
        artifact: await mapArtifactRow(
          config,
          artifact,
          shareLinks.get(artifact.id) ?? [],
          agentSlug,
        ),
      };
    }),
  );

  for (const mappedRow of mappedRows) {
    if (!mappedRow) {
      continue;
    }
    const existing = grouped.get(mappedRow.runId);
    if (existing) {
      existing.push(mappedRow.artifact);
    } else {
      grouped.set(mappedRow.runId, [mappedRow.artifact]);
    }
  }

  return grouped;
}

export async function getShareLinksByArtifactIds(
  db: AppDb,
  artifactIds: string[],
): Promise<Map<string, ArtifactShareLink[]>> {
  const grouped = new Map<string, ArtifactShareLink[]>();
  const uniqueIds = Array.from(new Set(artifactIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return grouped;
  }

  const rows = await db
    .select()
    .from(artifact_share_links)
    .where(
      and(
        inArray(artifact_share_links.artifact_id, uniqueIds),
        isNull(artifact_share_links.revoked_at),
      ),
    )
    .orderBy(desc(artifact_share_links.created_at));

  for (const row of rows) {
    const link: ArtifactShareLink = {
      id: row.id,
      artifactId: row.artifact_id,
      expiresAt: row.expires_at?.toISOString() ?? null,
      revokedAt: row.revoked_at?.toISOString() ?? null,
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
      downloadCount: row.download_count,
      createdAt: row.created_at.toISOString(),
    };
    const existing = grouped.get(row.artifact_id);
    if (existing) {
      existing.push(link);
    } else {
      grouped.set(row.artifact_id, [link]);
    }
  }

  return grouped;
}

export async function mapArtifactRow(
  config: RuntimeConfig,
  row: typeof artifactsTable.$inferSelect,
  shareLinks: ArtifactShareLink[],
  agentSlug?: string,
): Promise<Artifact> {
  return artifactSchema.parse({
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    description: row.description ?? undefined,
    type: row.type,
    link: row.link,
    fileManagerPath: await resolveArtifactFileManagerPath(config, row, agentSlug),
    createdAt: row.created_at.toISOString(),
    shareLinks,
  });
}

export async function getActiveReplyRunIds(db: AppDb, runIds: string[]): Promise<Set<string>> {
  const uniqueRunIds = Array.from(new Set(runIds.filter(Boolean)));

  if (uniqueRunIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ runId: task_run_followups.run_id })
    .from(task_run_followups)
    .where(
      and(
        inArray(task_run_followups.run_id, uniqueRunIds),
        eq(task_run_followups.status, "sending"),
      ),
    )
    .groupBy(task_run_followups.run_id);

  return new Set(rows.map((row) => row.runId));
}

/**
 * Derive the `waiting_for_opencode` sub-state for a running task run. Once the
 * async OpenCode prompt is accepted the executor persists `opencodeMonitor`
 * metadata and keeps the run `running` while the monitor polls, so a running run
 * carrying that metadata is waiting on OpenCode rather than holding a request.
 */

export function parseTaskTodos(value: string): TaskTodo[] {
  return taskTodoSchema.array().parse(JSON.parse(value));
}

export function parseFallbackModels(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    return fallbackModelsSchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}

export function normalizeFallbackModels(
  models: string[] | undefined,
  primaryModel?: string,
): string[] {
  const seen = new Set<string>();
  const primary = primaryModel?.trim();
  if (primary) {
    seen.add(primary);
  }

  const normalized: string[] = [];
  for (const raw of models ?? []) {
    const model = raw.trim();
    if (!model || seen.has(model)) {
      continue;
    }
    seen.add(model);
    normalized.push(model);
    if (normalized.length >= MAX_FALLBACK_MODELS) {
      break;
    }
  }

  return normalized;
}

export function normalizeTaskContext(input?: unknown): TaskContext {
  const context = taskContextInputSchema.parse(input ?? {});

  return taskContextSchema.parse({
    text: context.text?.trim() || undefined,
    attachments: context.attachments ?? [],
  });
}

export function parseTaskContext(value: string): TaskContext {
  if (!value.trim()) {
    return normalizeTaskContext();
  }

  return normalizeTaskContext(JSON.parse(value));
}

export function stringifyOptional(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function parseJsonRecord(value: string | null): Record<string, unknown> | undefined {
  return value ? z.record(z.string(), z.unknown()).parse(JSON.parse(value)) : undefined;
}

export function parseOptional<T>(
  value: string | null,
  schema: { parse(input: unknown): T },
): T | undefined {
  return value ? schema.parse(JSON.parse(value)) : undefined;
}
