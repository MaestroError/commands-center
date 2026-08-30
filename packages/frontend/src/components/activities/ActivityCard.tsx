import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ChevronDown, Link2 } from "lucide-react";

import {
  activityPresentationPayloadSchema,
  artifactSchema,
  reviewActivityPayloadSchema,
  taskRunArtifactSchema,
  type Activity,
  type ActivityKind,
  type Artifact,
  type TaskRunArtifact,
} from "@cc/shared/schemas";

import { Markdown } from "@/components/chat/Markdown";
import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import { AcceptanceCriteriaList } from "@/components/tasks/AcceptanceCriteria";
import { buildArtifactHref } from "@/components/tasks/task-format";
import { buttonVariants } from "@/components/ui/button-variants";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useTaskQuery } from "@/hooks/use-tasks-query";
import { cn } from "@/lib/cn";

import { ActivityActions } from "./ActivityActions";
import { formatRelativeActivityTime } from "./activity-format";
import { getActivityKindMeta } from "./activity-registry";

const ACTIVITY_KINDS_WITH_CRITERIA: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  "task_completed",
  "task_needs_review",
]);

const ACTIVITY_KINDS_WITH_ARTIFACTS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  "task_completed",
  "task_needs_review",
]);

const SWIPE_THRESHOLD_PX = 110;
const EXIT_DURATION_MS = 180;
const INTERACTIVE_SELECTOR = "button, input, textarea, a, label, [role='checkbox']";
const MOBILE_FIXED_FOOTER_CLASS =
  "relative z-10 border-t border-border shadow-[var(--shadow-fixed-footer)]";

const TONE_CLASSES = {
  accent: {
    edge: "border-l-accent",
    icon: "bg-accent/10 text-accent",
    pill: "border-accent/30 bg-accent/10 text-accent",
  },
  danger: {
    edge: "border-l-danger",
    icon: "bg-danger/10 text-danger",
    pill: "border-danger/30 bg-danger/10 text-danger",
  },
  success: {
    edge: "border-l-success",
    icon: "bg-success/10 text-success",
    pill: "border-success/30 bg-success/10 text-success",
  },
  warning: {
    edge: "border-l-warning",
    icon: "bg-warning/10 text-warning",
    pill: "border-warning/30 bg-warning/10 text-warning",
  },
} as const;

export type ActivityCardMode = "compact" | "pending" | "resolved";

type ActivityCardProps = {
  activity: Activity;
  mode?: ActivityCardMode;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  archiving?: boolean;
  unarchiving?: boolean;
  mobile?: boolean;
};

export function ActivityCard({
  activity,
  mode = "pending",
  onMarkRead,
  onMarkUnread,
  archiving,
  unarchiving,
  mobile = false,
}: ActivityCardProps) {
  const meta = getActivityKindMeta(activity.kind);
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  const reviewQuestion = readReviewQuestion(activity);
  const presentation = activityPresentationPayloadSchema.safeParse(activity.payload);
  const runOutput = presentation.success ? presentation.data.runOutput : undefined;
  const specialists = useSpecialistsQuery().data ?? [];
  const sourceSpecialistId = presentation.success
    ? presentation.data.sourceSpecialistId
    : undefined;
  const sourceSpecialistSlug = presentation.success
    ? (presentation.data.sourceSpecialistSlug ?? stringField(activity, "proposedBySlug"))
    : stringField(activity, "proposedBySlug");
  const specialist = specialists.find(
    (entry) =>
      (sourceSpecialistId !== undefined && entry.id === sourceSpecialistId) ||
      (sourceSpecialistSlug !== undefined && entry.slug === sourceSpecialistSlug),
  );
  const sourceName = specialist?.name ?? sourceSpecialistSlug;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<-1 | 0 | 1>(0);
  const cardRef = useRef<HTMLElement>(null);
  const resolvedRef = useRef(false);
  const markReadStartedRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    horizontal: boolean;
  } | null>(null);
  const pending = mode !== "resolved";
  const compact = mode === "compact";

  const moveFocusAfterRemoval = useCallback(() => {
    const card = cardRef.current;
    if (!card?.contains(document.activeElement)) {
      return;
    }
    const surface = card.closest("[data-activity-surface]");
    const cards = Array.from(surface?.querySelectorAll<HTMLElement>("[data-activity-card]") ?? []);
    const index = cards.indexOf(card);
    const nextFocus = cards[index + 1] ?? cards[index - 1];
    const fallback = surface?.querySelector<HTMLElement>(
      "[aria-pressed='true'], [data-activity-focus-fallback]",
    );
    (nextFocus ?? fallback)?.focus();
  }, []);

  const finishMarkRead = useCallback(() => {
    if (resolvedRef.current || !onMarkRead) {
      return;
    }
    resolvedRef.current = true;
    moveFocusAfterRemoval();
    onMarkRead(activity.id);
  }, [activity.id, moveFocusAfterRemoval, onMarkRead]);

  const requestMarkRead = useCallback(
    (_id?: string, direction: -1 | 1 = -1) => {
      if (!onMarkRead || archiving || markReadStartedRef.current) {
        return;
      }
      markReadStartedRef.current = true;
      setDragging(false);
      setDragX(0);
      setExitDirection(direction);
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      window.setTimeout(finishMarkRead, reduceMotion ? 0 : EXIT_DURATION_MS);
    },
    [archiving, finishMarkRead, onMarkRead],
  );

  function onPointerDown(event: ReactPointerEvent<HTMLElement>): void {
    if (!pending || !onMarkRead || archiving || exitDirection !== 0) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.horizontal) {
      if (Math.abs(dx) < 8) {
        return;
      }
      if (Math.abs(dx) <= Math.abs(dy)) {
        dragRef.current = null;
        return;
      }
      drag.horizontal = true;
      setDragging(true);
    }
    event.preventDefault();
    setDragX(dx);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    const finalDragX = event.clientX - drag.startX;
    if (drag.horizontal && finalDragX <= -SWIPE_THRESHOLD_PX) {
      requestMarkRead(activity.id);
      return;
    }
    setDragging(false);
    setDragX(0);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    setDragX(0);
  }

  const swipeHandlers = {
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp: onPointerEnd,
  };
  const transform =
    exitDirection === 0
      ? `translateX(${String(dragX)}px)`
      : `translateX(${String(exitDirection * 110)}%)`;
  const cardStyle: CSSProperties = { transform, opacity: exitDirection === 0 ? 1 : 0 };
  const iconTile = (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg",
        mobile ? "h-8 w-8" : "h-9 w-9",
        tone.icon,
      )}
    >
      <Icon aria-hidden="true" className={mobile ? "h-4 w-4" : "h-[18px] w-[18px]"} />
    </span>
  );
  const statusPill = (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full border font-medium",
        mobile ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        tone.pill,
      )}
    >
      {meta.label}
    </span>
  );
  const sourceMetadata = sourceName ? (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 overflow-hidden text-xs font-semibold text-text-secondary"
      data-testid="activity-source"
    >
      <span className="shrink-0 font-normal text-text-muted">by</span>
      <SpecialistAvatar iconPath={specialist?.iconPath} name={sourceName} size="xs" />
      <span className="truncate">{sourceName}</span>
    </span>
  ) : null;
  const timestamp = (
    <time className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-text-muted">
      {formatRelativeActivityTime(activity.createdAt)}
    </time>
  );

  return (
    <div
      className={cn(
        "relative min-w-0 w-full max-w-full overflow-hidden",
        mobile ? "h-full min-h-0 rounded-xl" : "rounded-lg",
      )}
    >
      {pending && onMarkRead ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-between bg-success-surface px-6 text-sm font-semibold text-success-foreground"
        >
          <span>Mark read</span>
          <span>Mark read</span>
        </div>
      ) : null}
      <article
        {...(!mobile ? swipeHandlers : {})}
        aria-label={activity.title}
        data-activity-card
        data-testid={`activity-card-${activity.id}`}
        ref={cardRef}
        style={cardStyle}
        tabIndex={-1}
        className={cn(
          "relative min-w-0 w-full max-w-full border border-l-[3px] border-border bg-surface",
          tone.edge,
          mobile ? "flex h-full min-h-0 flex-col rounded-xl" : "rounded-lg p-4 sm:p-5",
          dragging
            ? "cursor-grabbing transition-none"
            : "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
          pending && onMarkRead && !mobile && "cursor-grab touch-pan-y",
        )}
      >
        <header
          {...(mobile ? swipeHandlers : {})}
          data-testid={mobile ? "activity-card-header" : undefined}
          className={cn(
            mobile
              ? "relative z-10 max-h-[40%] min-h-0 shrink cursor-grab touch-pan-y overflow-y-auto overscroll-contain border-b border-border bg-surface p-4 shadow-[var(--shadow-fixed-header)] [scrollbar-width:thin] active:cursor-grabbing"
              : "flex items-start gap-3",
          )}
        >
          {mobile ? (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {iconTile}
                {statusPill}
                {sourceMetadata}
                <span className="ml-auto">{timestamp}</span>
              </div>
              <h3 className="mt-3 break-words text-base font-semibold leading-6 text-text-primary [overflow-wrap:anywhere]">
                {activity.title}
              </h3>
            </>
          ) : (
            <>
              {iconTile}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-text-primary [overflow-wrap:anywhere] sm:text-[17px]">
                    {activity.title}
                  </h3>
                  {timestamp}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {statusPill}
                  {sourceMetadata}
                </div>
              </div>
            </>
          )}
        </header>

        {!compact ? (
          <div
            className={cn(
              "min-w-0",
              mobile
                ? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-width:thin]"
                : "ml-12 mt-4 grid grid-cols-[minmax(0,1fr)] gap-4",
            )}
            data-testid={mobile ? "activity-card-body" : undefined}
          >
            {activity.body ? (
              <div className="break-words text-sm leading-6 text-text-primary [overflow-wrap:anywhere] sm:text-[15px] sm:leading-7">
                <Markdown content={activity.body} />
              </div>
            ) : null}
            {runOutput ? <ActivityRunOutput output={runOutput} /> : null}
            {ACTIVITY_KINDS_WITH_ARTIFACTS.has(activity.kind) ? (
              <ActivityArtifacts activity={activity} />
            ) : null}
            {ACTIVITY_KINDS_WITH_CRITERIA.has(activity.kind) ? (
              <ActivityAcceptanceCriteria
                activity={activity}
                defaultOpen={mobile}
                interactive={mode === "pending"}
              />
            ) : null}
            {reviewQuestion && (!mobile || mode === "resolved") ? (
              <section
                aria-label="Review question and reply"
                className="rounded-lg border border-accent/30 bg-accent/5 p-4"
              >
                <p className="flex items-start gap-2 break-words text-sm font-semibold leading-6 text-text-primary [overflow-wrap:anywhere]">
                  <span className="shrink-0 text-accent">Q:</span>
                  <span>{reviewQuestion}</span>
                </p>
                {mode === "pending" && onMarkRead ? (
                  <div className="mt-3 border-t border-accent/20 pt-3">
                    <ActivityActions
                      activity={activity}
                      archiving={archiving}
                      onArchive={requestMarkRead}
                      onArchiveImmediately={finishMarkRead}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}

        {mobile && mode === "pending" && reviewQuestion && onMarkRead ? (
          <section
            aria-label="Review question and reply"
            className={cn(
              MOBILE_FIXED_FOOTER_CLASS,
              "max-h-[60%] min-h-0 shrink overflow-y-auto overscroll-contain bg-surface-elevated p-3 [scrollbar-width:thin]",
            )}
            data-testid="activity-card-footer"
          >
            <p className="flex items-start gap-2 break-words text-sm font-semibold leading-5 text-text-primary [overflow-wrap:anywhere]">
              <span className="shrink-0 text-accent">Q:</span>
              <span>{reviewQuestion}</span>
            </p>
            <div className="mt-2">
              <ActivityActions
                activity={activity}
                archiving={archiving}
                onArchive={requestMarkRead}
                onArchiveImmediately={finishMarkRead}
              />
            </div>
          </section>
        ) : null}

        {mode === "pending" && onMarkRead && !reviewQuestion ? (
          <div
            className={cn(
              mobile
                ? cn(MOBILE_FIXED_FOOTER_CLASS, "shrink-0 bg-surface-elevated p-3")
                : "ml-12 mt-4",
            )}
            data-testid={mobile ? "activity-card-footer" : undefined}
          >
            <ActivityActions
              activity={activity}
              archiving={archiving}
              onArchive={requestMarkRead}
              onArchiveImmediately={finishMarkRead}
            />
          </div>
        ) : null}
        {mode === "compact" && onMarkRead ? (
          <div className="ml-12 mt-3">
            <ActivityActions
              activity={activity}
              archiving={archiving}
              onArchive={requestMarkRead}
              onArchiveImmediately={finishMarkRead}
            />
          </div>
        ) : null}
        {mode === "resolved" && onMarkUnread ? (
          <div
            className={cn(
              mobile
                ? cn(MOBILE_FIXED_FOOTER_CLASS, "shrink-0 bg-surface-elevated p-3")
                : "ml-12 mt-4",
            )}
            data-testid={mobile ? "activity-card-footer" : undefined}
          >
            <button
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "min-h-11 w-full md:min-h-0 md:w-auto",
              )}
              disabled={archiving || unarchiving}
              onClick={() => {
                moveFocusAfterRemoval();
                onMarkUnread(activity.id);
              }}
              type="button"
            >
              {unarchiving ? "Marking…" : "Mark unread"}
            </button>
          </div>
        ) : null}
      </article>
    </div>
  );
}

function ActivityRunOutput({ output }: { output: string }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left md:min-h-0"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          Run output
        </span>
        <span className="text-xs font-medium text-accent">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <pre className="max-h-56 min-w-0 max-w-full overflow-auto border-t border-border px-3 py-3 text-xs leading-6 text-text-secondary [scrollbar-width:thin]">
          <code>{output}</code>
        </pre>
      ) : null}
    </section>
  );
}

function ActivityArtifacts({ activity }: { activity: Activity }) {
  const artifacts = readActivityArtifacts(activity);

  if (artifacts.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
        Artifacts
      </p>
      <ul className="mt-2 grid gap-2" aria-label="Activity artifacts">
        {artifacts.map((artifact) => {
          const href = buildArtifactHref(artifact);
          return (
            <li key={`${artifact.type}:${artifact.link}:${artifact.title}`}>
              <a
                aria-label={artifact.title}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2.5 no-underline transition hover:border-accent/40"
                href={href}
                rel="noreferrer"
                target={artifact.type === "url" ? "_blank" : undefined}
              >
                <Link2 aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-semibold text-accent [overflow-wrap:anywhere]">
                    {artifact.title}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-text-muted">
                    {artifact.link}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActivityAcceptanceCriteria({
  activity,
  interactive,
  defaultOpen,
}: {
  activity: Activity;
  interactive: boolean;
  defaultOpen: boolean;
}) {
  const taskId = stringField(activity, "taskId") ?? "";
  const taskQuery = useTaskQuery(taskId || undefined);
  const task = taskQuery.data;
  const [open, setOpen] = useState(defaultOpen);

  if (!task || task.todos.length === 0) {
    return null;
  }

  const completed = task.todos.filter((todo) => todo.status === "completed").length;

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 bg-surface-elevated px-3 py-2.5 text-left md:min-h-0"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
          Acceptance criteria
        </span>
        <span className="flex items-center gap-2 text-xs text-text-secondary">
          {completed}/{task.todos.length} checked
          <ChevronDown
            aria-hidden="true"
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open ? (
        <AcceptanceCriteriaList
          className="gap-0 [&>li]:rounded-none [&>li]:border-x-0 [&>li]:border-b-0"
          interactive={interactive}
          task={task}
        />
      ) : null}
    </section>
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

function stringField(activity: Activity, key: string): string | undefined {
  const value = activity.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
