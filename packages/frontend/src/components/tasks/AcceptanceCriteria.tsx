import { Check } from "lucide-react";

import type { Task, UpdateTaskInput } from "@cc/shared/schemas";

import { useTaskMutations } from "@/hooks/use-tasks-query";

type AcceptanceCriteriaListProps = {
  task: Task;
  // When true, each criterion renders an operator checkbox that toggles its
  // status. Read-only elsewhere (e.g. template definitions, which have no run
  // to review against).
  interactive?: boolean;
  className?: string;
};

// Acceptance criteria are the operator's human-owned definition of done. The
// assigned specialist sees them in its run context but cannot check them off —
// only the operator does that here, during review.
export function AcceptanceCriteriaList({
  task,
  interactive = false,
  className,
}: AcceptanceCriteriaListProps) {
  const mutations = useTaskMutations();

  function toggle(todoId: string): void {
    mutations.update.mutate({
      id: task.id,
      input: { todos: buildToggledCriteria(task, todoId) },
    });
  }

  return (
    <ul aria-label="Acceptance criteria" className={`grid gap-2 ${className ?? ""}`}>
      {task.todos.map((todo) => {
        const isMet = todo.status === "completed";

        return (
          <li
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm text-text-secondary"
            key={todo.id}
          >
            {interactive ? (
              <button
                aria-checked={isMet}
                aria-label={`Mark "${todo.content}" as ${isMet ? "not met" : "met"}`}
                className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 md:h-4 md:w-4 ${
                  isMet
                    ? "border-accent text-accent"
                    : "border-border text-transparent hover:border-accent/50"
                }`}
                disabled={mutations.update.isPending}
                onClick={() => toggle(todo.id)}
                role="checkbox"
                type="button"
              >
                <Check aria-hidden="true" className="h-3 w-3" />
              </button>
            ) : (
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border opacity-60 ${
                  isMet ? "border-accent text-accent" : "border-border text-transparent"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
            )}
            <span className={isMet ? "text-text-muted line-through" : ""}>
              {todo.content}
              {/* The read-only marker is decorative, so convey met state to
                  screen readers here instead. The interactive variant exposes
                  it through the button's aria-checked. */}
              {!interactive ? (
                <span className="sr-only">{isMet ? " (met)" : " (not met)"}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Returns the full todos array with the targeted criterion toggled between
// completed and pending. Other items keep their existing status so an unrelated
// edit never clears the operator's checkmarks.
function buildToggledCriteria(task: Task, todoId: string): NonNullable<UpdateTaskInput["todos"]> {
  return task.todos.map((todo) => {
    const status =
      todo.id === todoId ? (todo.status === "completed" ? "pending" : "completed") : todo.status;

    const input: NonNullable<UpdateTaskInput["todos"]>[number] = {
      id: todo.id,
      content: todo.content,
      status,
      createdAt: todo.createdAt,
    };

    // Preserve an existing completion timestamp, but leave it unset for newly
    // completed items so the backend stamps completedAt with server time
    // (avoids client clock skew). The backend clears it when status !== completed.
    if (status === "completed" && todo.completedAt) {
      input.completedAt = todo.completedAt;
    }

    return input;
  });
}
