import { formatToken } from "@/components/tasks/task-format";

export function StatusBadge(props: { status: string }) {
  const tone = ["failed", "cancelled"].includes(props.status)
    ? "border-danger/30 bg-danger/10 text-danger"
    : ["running", "in_progress"].includes(props.status)
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : props.status === "queued"
        ? "border-accent/25 bg-accent/10 text-accent"
        : "border-accent/20 bg-accent/10 text-accent";

  return (
    <span className={`rounded-full border px-3 py-1 text-xs ${tone}`}>
      {formatToken(props.status)}
    </span>
  );
}
