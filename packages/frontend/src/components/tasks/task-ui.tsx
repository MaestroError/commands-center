import { formatToken } from "@/components/tasks/task-format";

export function StatusBadge(props: { status: string }) {
  const tone = ["failed", "error", "cancelled"].includes(props.status)
    ? "border-danger/30 bg-danger/10 text-danger"
    : ["running", "in_progress"].includes(props.status)
      ? "border-warning-border bg-warning-surface text-warning-foreground"
      : props.status === "queued"
        ? "border-accent/25 bg-accent/10 text-accent"
        : "border-accent/20 bg-accent/10 text-accent";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs ${tone}`}>
      {formatToken(props.status)}
    </span>
  );
}
