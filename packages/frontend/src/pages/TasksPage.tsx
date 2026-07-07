// Route entry for the Tasks feature. The per-mode pages live in ./tasks/*
// (issue #99 god-file split).

import { TaskFormPage } from "./tasks/TaskFormPage";
import { TaskListPage } from "./tasks/TaskListPage";
import { TaskTemplateFormPage } from "./tasks/TaskTemplateFormPage";
import type { TasksPageProps } from "./tasks/task-helpers";

export function TasksPage(props: TasksPageProps) {
  if (props.mode === "create") return <TaskFormPage mode="create" />;
  if (props.mode === "edit") return <TaskFormPage mode="edit" />;
  if (props.mode === "template-create") return <TaskTemplateFormPage mode="create" />;
  if (props.mode === "template-edit") return <TaskTemplateFormPage mode="edit" />;
  return <TaskListPage />;
}
