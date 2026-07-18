// Split out of TasksPage.tsx (issue #99).

import { EmptyState } from "@/components/common/PageStates";
import { formatDate } from "@/components/tasks/task-format";
import { StatusBadge } from "@/components/tasks/task-ui";
import type { Specialist, Task } from "@cc/shared/schemas";
import { Link } from "react-router-dom";
import { Metric } from "./TaskDetailPanel";
import { Button } from "@/components/ui/button";

export function TaskArchiveView(props: {
  tasks: Task[];
  agents: Specialist[];
  currentSearch: string;
  onRestore: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  if (props.tasks.length === 0) {
    return (
      <EmptyState
        description="Accepted or archived tasks appear here after they leave the active board."
        title="No archived tasks yet"
      />
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {props.tasks.map((task) => (
        <article
          className="cc-panel grid gap-4 p-5"
          data-testid={`task-card-${task.id}`}
          key={task.id}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                className="text-xl font-semibold text-text-primary transition hover:text-accent"
                to={`/tasks/${task.id}${props.currentSearch}`}
              >
                {task.title}
              </Link>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                {task.description || "No description provided."}
              </p>
            </div>
            <StatusBadge status="archived" />
          </div>
          <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-3">
            <Metric
              label="Specialist"
              value={props.agents.find((entry) => entry.id === task.agentId)?.name ?? task.agentId}
            />
            <Metric label="Archived" value={formatDate(task.archivedAt)} />
            <Metric label="Completed" value={formatDate(task.doneAt)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => props.onRestore(task)} type="button">
              Restore
            </Button>
            <Button variant="danger" onClick={() => props.onDelete(task)} type="button">
              Delete
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
