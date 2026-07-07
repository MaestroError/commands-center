import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import {
  reviewActivityPayloadSchema,
  runCommandProposalPayloadSchema,
  runTemplateProposalPayloadSchema,
  taskProposalPayloadSchema,
  taskTemplateProposalPayloadSchema,
  type Activity,
} from "@cc/shared/schemas";

import { useFillSecretMutation } from "@/hooks/use-activities-query";
import { useSpecialistsQuery } from "@/hooks/use-specialists-query";
import { useTaskMutations } from "@/hooks/use-tasks-query";
import { setPendingTerminalCommand } from "@/lib/terminal-prefill";

type ActivityActionsProps = {
  activity: Activity;
  onArchive: (id: string) => void;
  archiving?: boolean;
};

/**
 * Per-kind action buttons. The primary (highlighted) button is always the one
 * that resolves the activity — i.e. moves it from Unreads to Resolved.
 */
export function ActivityActions(props: ActivityActionsProps) {
  switch (props.activity.kind) {
    case "secret_request":
      return <SecretRequestActions {...props} />;
    case "task_completed":
      return <TaskOutcomeActions {...props} />;
    case "task_needs_review":
    case "subtask_needs_review":
      return <ReviewReplyActions {...props} />;
    case "task_proposal":
      return <TaskProposalActions {...props} />;
    case "task_template_proposal":
      return <TaskTemplateProposalActions {...props} />;
    case "run_template_proposal":
      return <RunTemplateProposalActions {...props} />;
    case "run_command_proposal":
      return <RunCommandProposalActions {...props} />;
    default:
      // specialist_info, specialist_warning, feedback_resolved, task_run_failed
      return <InfoActions {...props} />;
  }
}

function SecretRequestActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const fillSecret = useFillSecretMutation();

  if (!open) {
    return (
      <ActionRow>
        <ActionButton variant="primary" onClick={() => setOpen(true)}>
          Fill secret
        </ActionButton>
        <ActionButton variant="muted" disabled={archiving} onClick={() => onArchive(activity.id)}>
          Dismiss
        </ActionButton>
      </ActionRow>
    );
  }

  const submit = () => {
    if (!value || fillSecret.isPending) {
      return;
    }
    fillSecret.mutate(
      { id: activity.id, value },
      {
        onSuccess: () => {
          setOpen(false);
          setValue("");
        },
      },
    );
  };

  return (
    <form
      className="mt-1 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        type="password"
        aria-label="Secret value"
        placeholder="Secret value"
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
      />
      <p className="text-[11px] text-text-secondary">
        The value is stored encrypted and saving restarts the AI engine.
      </p>
      <ActionRow>
        <ActionButton variant="primary" type="submit" disabled={!value || fillSecret.isPending}>
          {fillSecret.isPending ? "Saving…" : "Save"}
        </ActionButton>
        <ActionButton
          variant="muted"
          type="button"
          onClick={() => {
            setOpen(false);
            setValue("");
          }}
        >
          Cancel
        </ActionButton>
      </ActionRow>
      {fillSecret.isError ? <ActionError>Could not save the secret.</ActionError> : null}
    </form>
  );
}

function ReviewReplyActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const navigate = useNavigate();
  const parsed = reviewActivityPayloadSchema.safeParse(activity.payload);
  const taskId = parsed.success ? parsed.data.taskId : undefined;
  const runId = parsed.success ? parsed.data.taskRunId : undefined;
  const question = parsed.success ? parsed.data.question : undefined;
  const suggestedReplies = parsed.success ? (parsed.data.suggestedReplies ?? []) : [];
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { createRunFollowup } = useTaskMutations();
  const submitting = createRunFollowup.isPending;
  const canSubmit = Boolean(taskId && runId && reply.trim()) && !submitting && !archiving;

  const submitReply = async () => {
    if (!taskId || !runId || !reply.trim()) {
      return;
    }

    setError(null);
    try {
      await createRunFollowup.mutateAsync({
        taskId,
        runId,
        input: { body: reply, kind: "review_answer" },
      });
      onArchive(activity.id);
      setReply("");
    } catch {
      setError("Could not send the reply.");
    }
  };

  return (
    <div className="grid gap-2">
      {suggestedReplies.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestedReplies.map((suggestedReply, index) => (
            <button
              aria-label={`Use suggested reply: ${suggestedReply}`}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary transition hover:border-accent/50 hover:text-accent"
              key={`${index}-${suggestedReply}`}
              type="button"
              onClick={() => setReply(suggestedReply)}
            >
              {suggestedReply}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        aria-label={question ? "Review reply" : "Reply to review request"}
        className="min-h-20 w-full resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-accent/60"
        placeholder={question ? "Reply to the question..." : "Add a reply..."}
        value={reply}
        onChange={(event) => setReply(event.target.value)}
      />
      <ActionRow>
        <ActionButton variant="primary" disabled={!canSubmit} onClick={() => void submitReply()}>
          {submitting ? "Sending..." : "Reply"}
        </ActionButton>
        {taskId ? (
          <ActionButton variant="muted" onClick={() => void navigate(openTaskPath(taskId))}>
            Open task
          </ActionButton>
        ) : null}
      </ActionRow>
      {error ? <ActionError>{error}</ActionError> : null}
    </div>
  );
}

function TaskOutcomeActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const navigate = useNavigate();
  const { accept } = useTaskMutations();
  const taskId = stringField(activity, "taskId");

  const handleAccept = () => {
    if (!taskId || accept.isPending) {
      return;
    }
    accept.mutate(taskId, { onSuccess: () => onArchive(activity.id) });
  };

  return (
    <ActionRow>
      <ActionButton
        variant="primary"
        disabled={!taskId || accept.isPending || archiving}
        onClick={handleAccept}
      >
        {accept.isPending ? "Accepting…" : "Accept"}
      </ActionButton>
      {taskId ? (
        <ActionButton variant="secondary" onClick={() => void navigate(openTaskPath(taskId))}>
          Open task
        </ActionButton>
      ) : null}
      {accept.isError ? <ActionError>Could not accept the task.</ActionError> : null}
    </ActionRow>
  );
}

function InfoActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const navigate = useNavigate();
  const taskId = stringField(activity, "taskId");

  return (
    <ActionRow>
      <ActionButton variant="primary" disabled={archiving} onClick={() => onArchive(activity.id)}>
        Mark read
      </ActionButton>
      {taskId ? (
        <ActionButton variant="secondary" onClick={() => void navigate(openTaskPath(taskId))}>
          Open task
        </ActionButton>
      ) : null}
    </ActionRow>
  );
}

// A specialist proposed creating a task. The operator reviews title/reason,
// picks the owning specialist, and confirms — nothing is created until then.
function TaskProposalActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const parsed = taskProposalPayloadSchema.safeParse(activity.payload);
  const { create } = useTaskMutations();
  const specialistsQuery = useSpecialistsQuery();
  const specialists = specialistsQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(parsed.success ? parsed.data.title : activity.title);
  const proposedAssignee = parsed.success
    ? specialists.find((entry) => entry.slug === parsed.data.assigneeSlug)
    : undefined;
  const [agentId, setAgentId] = useState<string>(proposedAssignee?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const description = parsed.success ? (parsed.data.prompt ?? parsed.data.reason) : "";
  const effectiveAgentId = agentId || proposedAssignee?.id || specialists[0]?.id || "";
  const canSubmit = Boolean(title.trim() && effectiveAgentId) && !create.isPending && !archiving;

  if (!open) {
    return (
      <ActionRow>
        <ActionButton variant="primary" disabled={archiving} onClick={() => setOpen(true)}>
          Review & create
        </ActionButton>
        <ActionButton variant="muted" disabled={archiving} onClick={() => onArchive(activity.id)}>
          Dismiss
        </ActionButton>
      </ActionRow>
    );
  }

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    setError(null);
    create.mutate(
      { agentId: effectiveAgentId, title: title.trim(), description },
      {
        onSuccess: () => onArchive(activity.id),
        onError: () => setError("Could not create the task."),
      },
    );
  };

  return (
    <div className="mt-1 grid gap-2">
      <ProposalField label="Title">
        <input
          aria-label="Task title"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </ProposalField>
      <ProposalField label="Assign to">
        <select
          aria-label="Assign task to specialist"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
          value={effectiveAgentId}
          onChange={(event) => setAgentId(event.target.value)}
        >
          {specialists.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </ProposalField>
      {description ? <ProposalReason>{description}</ProposalReason> : null}
      <ActionRow>
        <ActionButton variant="primary" disabled={!canSubmit} onClick={submit}>
          {create.isPending ? "Creating…" : "Create task"}
        </ActionButton>
        <ActionButton variant="muted" type="button" onClick={() => setOpen(false)}>
          Cancel
        </ActionButton>
      </ActionRow>
      {error ? <ActionError>{error}</ActionError> : null}
    </div>
  );
}

// A specialist proposed a recurring task template. Same review flow as a task
// proposal, but creates a template owned by the chosen specialist.
function TaskTemplateProposalActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const parsed = taskTemplateProposalPayloadSchema.safeParse(activity.payload);
  const { createTemplate } = useTaskMutations();
  const specialistsQuery = useSpecialistsQuery();
  const specialists = specialistsQuery.data ?? [];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(parsed.success ? parsed.data.title : activity.title);
  const proposedAssignee = parsed.success
    ? specialists.find((entry) => entry.slug === parsed.data.assigneeSlug)
    : undefined;
  const [agentId, setAgentId] = useState<string>(proposedAssignee?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const description = parsed.success ? (parsed.data.prompt ?? parsed.data.reason) : "";
  const effectiveAgentId = agentId || proposedAssignee?.id || specialists[0]?.id || "";
  const canSubmit =
    Boolean(title.trim() && effectiveAgentId) && !createTemplate.isPending && !archiving;

  if (!open) {
    return (
      <ActionRow>
        <ActionButton variant="primary" disabled={archiving} onClick={() => setOpen(true)}>
          Review & create
        </ActionButton>
        <ActionButton variant="muted" disabled={archiving} onClick={() => onArchive(activity.id)}>
          Dismiss
        </ActionButton>
      </ActionRow>
    );
  }

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    setError(null);
    createTemplate.mutate(
      { defaultAgentId: effectiveAgentId, title: title.trim(), description },
      {
        onSuccess: () => onArchive(activity.id),
        onError: () => setError("Could not create the template."),
      },
    );
  };

  return (
    <div className="mt-1 grid gap-2">
      <ProposalField label="Title">
        <input
          aria-label="Template title"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </ProposalField>
      <ProposalField label="Assign to">
        <select
          aria-label="Assign template to specialist"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-accent/60"
          value={effectiveAgentId}
          onChange={(event) => setAgentId(event.target.value)}
        >
          {specialists.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </ProposalField>
      {description ? <ProposalReason>{description}</ProposalReason> : null}
      <ActionRow>
        <ActionButton variant="primary" disabled={!canSubmit} onClick={submit}>
          {createTemplate.isPending ? "Creating…" : "Create template"}
        </ActionButton>
        <ActionButton variant="muted" type="button" onClick={() => setOpen(false)}>
          Cancel
        </ActionButton>
      </ActionRow>
      {error ? <ActionError>{error}</ActionError> : null}
    </div>
  );
}

// A specialist proposed running an existing template now. One-click confirm.
function RunTemplateProposalActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const parsed = runTemplateProposalPayloadSchema.safeParse(activity.payload);
  const { createFromTemplate } = useTaskMutations();
  const [error, setError] = useState<string | null>(null);
  const templateId = parsed.success ? parsed.data.templateId : undefined;

  const run = () => {
    if (!templateId || createFromTemplate.isPending) {
      return;
    }
    setError(null);
    createFromTemplate.mutate(templateId, {
      onSuccess: () => onArchive(activity.id),
      onError: () => setError("Could not run the template."),
    });
  };

  return (
    <ActionRow>
      <ActionButton
        variant="primary"
        disabled={!templateId || createFromTemplate.isPending || archiving}
        onClick={run}
      >
        {createFromTemplate.isPending ? "Running…" : "Run template"}
      </ActionButton>
      <ActionButton variant="muted" disabled={archiving} onClick={() => onArchive(activity.id)}>
        Dismiss
      </ActionButton>
      {error ? <ActionError>{error}</ActionError> : null}
    </ActionRow>
  );
}

// A specialist proposed a terminal command. Confirming opens the global
// terminal prefilled with the command (operator reviews and presses Enter).
function RunCommandProposalActions({ activity, onArchive, archiving }: ActivityActionsProps) {
  const navigate = useNavigate();
  const parsed = runCommandProposalPayloadSchema.safeParse(activity.payload);
  const command = parsed.success ? parsed.data.command : undefined;
  const [confirming, setConfirming] = useState(false);

  const openInTerminal = () => {
    if (!command) {
      return;
    }
    setPendingTerminalCommand(command);
    onArchive(activity.id);
    void navigate("/terminal");
  };

  if (!command) {
    return <InfoActions activity={activity} onArchive={onArchive} archiving={archiving} />;
  }

  return (
    <div className="mt-1 grid gap-2">
      <pre className="overflow-x-auto rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-primary">
        <code>{command}</code>
      </pre>
      {confirming ? (
        <>
          <p className="text-[11px] text-text-secondary">
            This opens your terminal with the command prefilled. Review it, then press Enter to run.
          </p>
          <ActionRow>
            <ActionButton variant="primary" disabled={archiving} onClick={openInTerminal}>
              Open terminal
            </ActionButton>
            <ActionButton variant="muted" type="button" onClick={() => setConfirming(false)}>
              Cancel
            </ActionButton>
          </ActionRow>
        </>
      ) : (
        <ActionRow>
          <ActionButton variant="primary" disabled={archiving} onClick={() => setConfirming(true)}>
            Run command
          </ActionButton>
          <ActionButton variant="muted" disabled={archiving} onClick={() => onArchive(activity.id)}>
            Dismiss
          </ActionButton>
        </ActionRow>
      )}
    </div>
  );
}

function ProposalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[11px] text-text-secondary">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ProposalReason({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap text-xs text-text-secondary">{children}</p>;
}

// Open the task on the board (side panel), not the standalone task page.
function openTaskPath(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}`;
}

function stringField(activity: Activity, key: string): string | undefined {
  const value = activity.payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function ActionButton({
  children,
  onClick,
  disabled,
  type = "button",
  variant,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  variant: "primary" | "secondary" | "muted";
}) {
  const className =
    variant === "primary"
      ? "rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      : variant === "secondary"
        ? "rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-primary transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
        : "rounded-md px-2.5 py-1 text-xs text-text-secondary transition hover:text-text-primary disabled:opacity-50";
  return (
    <button type={type} className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function ActionError({ children }: { children: ReactNode }) {
  return <span className="text-xs text-danger">{children}</span>;
}
