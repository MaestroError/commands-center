import {
  artifactSchema,
  reviewActivityPayloadSchema,
  taskRunArtifactSchema,
  type Activity,
  type ActivityKind,
  type Artifact,
  type TaskRunArtifact,
} from "@cc/shared/schemas";

import { Markdown } from "@/components/chat/Markdown";
import { AcceptanceCriteriaList } from "@/components/tasks/AcceptanceCriteria";
import { buildArtifactHref } from "@/components/tasks/task-format";
import { useTaskQuery } from "@/hooks/use-tasks-query";

import { ActivityActions } from "./ActivityActions";
import { getActivityKindMeta } from "./activity-registry";

// Outcome notifications carry the task's definition of done, so surface the
// acceptance criteria inline — the operator verifies them right where they
// accept or review, without opening the task.
const ACTIVITY_KINDS_WITH_CRITERIA: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  "task_completed",
  "task_needs_review",
]);

const ACTIVITY_KINDS_WITH_ARTIFACTS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  "task_completed",
  "task_needs_review",
]);

type ActivityCardProps = {
  activity: Activity;
  onArchive?: (id: string) => void;
  archiving?: boolean;
  compact?: boolean;
  /** Read-only history card (Resolved tab): no action buttons. */
  readOnly?: boolean;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function ActivityCard({
  activity,
  onArchive,
  archiving,
  compact,
  readOnly,
}: ActivityCardProps) {
  const meta = getActivityKindMeta(activity.kind);
  const Icon = meta.icon;
  const actionRequired = activity.level === "action_required";
  const reviewQuestion = readReviewQuestion(activity);

  return (
    <div
      className={`min-w-0 rounded-md border bg-surface p-3 ${
        actionRequired && !readOnly ? "border-accent/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            actionRequired && !readOnly
              ? "bg-accent/10 text-accent"
              : "bg-border/40 text-text-secondary"
          }`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <p className="min-w-0 flex-1 basis-40 whitespace-normal break-words text-sm font-medium leading-5 text-text-primary [overflow-wrap:anywhere]">
              {activity.title}
            </p>
            <span className="shrink-0 whitespace-nowrap text-[11px] text-text-secondary">
              {relativeTime(activity.createdAt)}
            </span>
          </div>
          {activity.body && !compact ? (
            <div className="mt-1.5 max-h-48 overflow-auto break-words text-xs text-text-secondary">
              <Markdown content={activity.body} />
            </div>
          ) : null}
          {!compact && ACTIVITY_KINDS_WITH_ARTIFACTS.has(activity.kind) ? (
            <ActivityArtifacts activity={activity} />
          ) : null}
          {!compact && ACTIVITY_KINDS_WITH_CRITERIA.has(activity.kind) ? (
            <ActivityAcceptanceCriteria activity={activity} interactive={!readOnly} />
          ) : null}
          {reviewQuestion && !compact ? (
            <section
              aria-label="Review question and reply"
              className="mt-2 rounded-md border border-accent/30 bg-accent/5 p-3"
            >
              <p className="flex items-start gap-1.5 break-words text-sm font-semibold text-text-primary [overflow-wrap:anywhere]">
                <span className="shrink-0 text-accent">Q:</span>
                <span>{reviewQuestion}</span>
              </p>
              {!readOnly && onArchive ? (
                <div className="mt-3 border-t border-accent/20 pt-3">
                  <ActivityActions
                    activity={activity}
                    onArchive={onArchive}
                    archiving={archiving}
                  />
                </div>
              ) : null}
            </section>
          ) : !readOnly && onArchive ? (
            <div className="mt-2">
              <ActivityActions activity={activity} onArchive={onArchive} archiving={archiving} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActivityArtifacts({ activity }: { activity: Activity }) {
  const artifacts = readActivityArtifacts(activity);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        Artifacts
      </p>
      <ul className="mt-1.5 grid gap-1.5" aria-label="Activity artifacts">
        {artifacts.map((artifact) => {
          const href = buildArtifactHref(artifact);
          return (
            <li
              className="rounded-md border border-border bg-background px-2 py-1.5"
              key={`${artifact.type}:${artifact.link}:${artifact.title}`}
            >
              <a
                className="break-words text-xs font-medium text-accent underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                href={href}
                rel="noreferrer"
                target={artifact.type === "url" ? "_blank" : undefined}
              >
                {artifact.title}
              </a>
              <span className="mt-0.5 block text-[11px] text-text-muted [overflow-wrap:anywhere]">
                {artifact.link}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Loads the activity's task and renders its acceptance criteria. Returns nothing
// until the task resolves or when it has no criteria, so the card stays compact
// for tasks without a defined "done". Interactive (operator can tick criteria)
// unless the card is read-only history.
function ActivityAcceptanceCriteria({
  activity,
  interactive,
}: {
  activity: Activity;
  interactive: boolean;
}) {
  const taskId = typeof activity.payload["taskId"] === "string" ? activity.payload["taskId"] : "";
  const taskQuery = useTaskQuery(taskId || undefined);
  const task = taskQuery.data;

  if (!task || task.todos.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        Acceptance criteria
      </p>
      <AcceptanceCriteriaList className="mt-1.5" interactive={interactive} task={task} />
    </div>
  );
}

function readActivityArtifacts(activity: Activity): Array<Artifact | TaskRunArtifact> {
  const artifacts = activity.payload["artifacts"];

  if (!Array.isArray(artifacts)) {
    return [];
  }

  return artifacts.flatMap((artifact) => {
    const enrichedArtifact = artifactSchema.safeParse(artifact);
    if (enrichedArtifact.success) {
      return [enrichedArtifact.data];
    }

    const legacyArtifact = taskRunArtifactSchema.safeParse(artifact);
    return legacyArtifact.success ? [legacyArtifact.data] : [];
  });
}

function readReviewQuestion(activity: Activity): string | undefined {
  if (activity.kind !== "task_needs_review" && activity.kind !== "subtask_needs_review") {
    return undefined;
  }

  const parsed = reviewActivityPayloadSchema.safeParse(activity.payload);
  return parsed.success ? parsed.data.question : undefined;
}
