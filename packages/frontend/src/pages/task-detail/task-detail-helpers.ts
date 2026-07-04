// Split out of TaskDetailPage.tsx (issue #99).

import { buildArtifactHref, formatDate } from "@/components/tasks/task-format";
import { buildFileManagerHref } from "@/lib/file-manager-href";
import type {
  ConversationPart,
  Task,
  TaskRun,
  TaskRunArtifact,
  TaskSubtask,
} from "@cc/shared/schemas";

export function buildTaskContextAttachmentHref(storageKey: string): string {
  return buildFileManagerHref({
    root: "workspace",
    path: `sessions/${storageKey}`,
    openInEditor: true,
  });
}

export function readBoardStatus(task: Task): string {
  return task.archived ? "archived" : task.status;
}

export function readLatestRunResult(
  runs: TaskRun[],
): { content: string; run: TaskRun } | undefined {
  const [latestRun] = runs;
  const content = latestRun
    ? (latestRun.finalMessage ?? latestRun.resultText ?? latestRun.errorMessage)
    : undefined;

  return latestRun && content ? { content, run: latestRun } : undefined;
}

type AggregatedRunArtifact = {
  key: string;
  title: string;
  description?: string;
  link: string;
  href: string;
  external: boolean;
  latestRun: TaskRun;
  runCount: number;
};

export function hasTaskResultSummary(run: TaskRun): boolean {
  return Boolean(run.finalMessage || run.resultText || run.errorMessage || run.needsHumanReview);
}

export function aggregateRunArtifacts(runs: TaskRun[]): AggregatedRunArtifact[] {
  const byKey = new Map<
    string,
    { artifact: TaskRunArtifact; latestRun: TaskRun; runIds: Set<string> }
  >();

  for (const run of runs) {
    for (const artifact of run.artifacts) {
      const key = `${artifact.type}:${artifact.link}`;
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, { artifact, latestRun: run, runIds: new Set([run.id]) });
        continue;
      }

      existing.runIds.add(run.id);
      if (isRunNewer(run, existing.latestRun)) {
        existing.latestRun = run;
        existing.artifact = artifact;
      }
    }
  }

  return [...byKey.entries()].map(([key, entry]) => ({
    key,
    title: entry.artifact.title,
    description: entry.artifact.description,
    link: entry.artifact.link,
    href: buildArtifactHref(entry.artifact),
    external: entry.artifact.type === "url",
    latestRun: entry.latestRun,
    runCount: entry.runIds.size,
  }));
}

function isRunNewer(candidate: TaskRun, current: TaskRun): boolean {
  return (
    Date.parse(candidate.completedAt ?? candidate.updatedAt) >
    Date.parse(current.completedAt ?? current.updatedAt)
  );
}

export function formatTodoProgress(task: Task): string {
  if (task.todos.length === 0) return "0/0";
  const completed = task.todos.filter((todo) => todo.status === "completed").length;
  return `${String(completed)}/${String(task.todos.length)}`;
}

export function formatSourceTemplate(task: Task): string {
  if (!task.sourceTemplateId) return "User-created task";
  return task.sourceOccurrenceAt
    ? `Generated ${formatDate(task.sourceOccurrenceAt)}`
    : "Generated from template";
}

export function formatSchedule(task: Task): string {
  if (task.scheduledAt) return `Scheduled ${formatDate(task.scheduledAt)}`;
  if (task.scheduledFor) return `Scheduled ${formatDate(task.scheduledFor)}`;
  if (task.dueAt) return `Due ${formatDate(task.dueAt)}`;
  return "Not scheduled";
}

export function formatRunTarget(run: TaskRun, subtasks: TaskSubtask[]): string {
  if (!run.subtaskId) return "Parent task";

  const subtask = subtasks.find((entry) => entry.id === run.subtaskId);
  return subtask ? `Subtask: ${subtask.description}` : `Subtask: ${run.subtaskId}`;
}

export function formatRunDuration(run: TaskRun): string {
  if (!run.startedAt) return "-";

  const end = run.completedAt ?? run.cancelledAt ?? run.updatedAt;
  const durationMs = Date.parse(end) - Date.parse(run.startedAt);

  if (!Number.isFinite(durationMs) || durationMs < 0) return "-";
  if (durationMs < 1000) return "<1s";

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function readError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Request failed.";
}

export function readResultMessageCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;

  const messageCount = (value as Record<string, unknown>)["messageCount"];
  return typeof messageCount === "number" ? messageCount : undefined;
}

export function isToolPart(part: ConversationPart): boolean {
  return part.type === "tool" || part.type === "tool_call";
}

export function readToolName(part: ConversationPart): string {
  const value = part["tool"] ?? part["name"];
  return typeof value === "string" && value.trim() ? value : "Tool";
}

export function readToolStatus(part: ConversationPart): string | undefined {
  const state = readToolState(part);
  const status = state?.["status"];

  return typeof status === "string" && status.trim() ? status : undefined;
}

export function readToolStateField(part: ConversationPart, key: string): unknown {
  return readToolState(part)?.[key];
}

function readToolState(part: ConversationPart): Record<string, unknown> | undefined {
  const state = part["state"];
  return state && typeof state === "object" && !Array.isArray(state)
    ? (state as Record<string, unknown>)
    : undefined;
}

export function formatToolLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}
