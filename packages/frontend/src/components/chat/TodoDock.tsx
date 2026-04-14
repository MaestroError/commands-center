import { useState } from "react";

type TodoItem = {
  content: string;
  status: string;
  activeForm?: string;
};

type TodoDockProps = {
  todos: TodoItem[];
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <span className="text-text-secondary">&#9675;</span>;
    case "in_progress":
      return <span className="text-accent">&#9673;</span>;
    case "completed":
      return <span className="text-success">&#10003;</span>;
    default:
      return <span className="text-text-secondary">&#9675;</span>;
  }
}

export function TodoDock({ todos }: TodoDockProps) {
  const [expanded, setExpanded] = useState(true);

  if (todos.length === 0) return null;

  return (
    <div className="border border-border rounded-xl p-3 bg-surface mb-2">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="text-sm font-semibold text-text-primary">
          Tasks <span className="text-text-secondary font-normal">({todos.length})</span>
        </span>
        <span className="text-text-secondary text-sm">{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded ? (
        <ul className="mt-2 space-y-1">
          {todos.map((todo, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                <StatusIcon status={todo.status} />
              </span>
              <span
                className={
                  todo.status === "completed"
                    ? "text-text-secondary line-through"
                    : "text-text-primary"
                }
              >
                {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
