import type { Task, TaskRun, TaskTemplate } from "@cc/shared/schemas";

import type { RuntimeConfig } from "../../lib/runtime-config.js";

export function buildTaskBoardUrl(config: RuntimeConfig, taskId: string): string {
  const url = new URL("/tasks", config.security.publicOrigin);
  url.searchParams.set("task", taskId);
  return url.toString();
}

export function buildTaskTemplateBoardUrl(config: RuntimeConfig, templateId: string): string {
  const url = new URL("/tasks", config.security.publicOrigin);
  url.searchParams.set("view", "templates");
  url.searchParams.set("template", templateId);
  return url.toString();
}

export function withTaskBoardUrl(config: RuntimeConfig, task: Task): Task & { url: string } {
  return { ...task, url: buildTaskBoardUrl(config, task.id) };
}

export function withTaskTemplateBoardUrl(
  config: RuntimeConfig,
  template: TaskTemplate,
): TaskTemplate & { url: string } {
  return { ...template, url: buildTaskTemplateBoardUrl(config, template.id) };
}

export function withTaskRunBoardUrl(
  config: RuntimeConfig,
  run: TaskRun,
): TaskRun & { taskUrl: string } {
  return { ...run, taskUrl: buildTaskBoardUrl(config, run.taskId) };
}
