import type { ComponentType } from "react";
import type { ConversationPart } from "@cc/shared/schemas";

/** Tools that get grouped into collapsible "Gathered context" rows */
export const CONTEXT_GROUP_TOOLS = new Set(["read", "glob", "grep", "list"]);

/** Tools hidden from the message stream entirely */
export const HIDDEN_TOOLS = new Set(["todowrite"]);

export type ToolRendererProps = {
  part: ConversationPart;
};

const registry = new Map<string, ComponentType<ToolRendererProps>>();

export function registerTool(name: string, component: ComponentType<ToolRendererProps>) {
  registry.set(name, component);
}

export function resolveToolRenderer(name: string): ComponentType<ToolRendererProps> | undefined {
  return registry.get(name);
}

export function getToolName(part: ConversationPart): string {
  return (part["tool"] as string | undefined) ?? (part["name"] as string | undefined) ?? "tool";
}

export function getToolState(part: ConversationPart): Record<string, unknown> | undefined {
  return part["state"] as Record<string, unknown> | undefined;
}

export function getToolStatus(part: ConversationPart): string | undefined {
  const state = getToolState(part);
  return state?.["status"] as string | undefined;
}

export function getToolInput(part: ConversationPart): Record<string, unknown> | undefined {
  const state = getToolState(part);
  const input = state?.["input"];
  if (input && typeof input === "object") return input as Record<string, unknown>;
  return undefined;
}

export function getStatusDisplay(status: string | undefined): { label: string; className: string } {
  switch (status) {
    case "pending":
    case "running":
      return { label: "Running", className: "text-info" };
    case "completed":
      return { label: "Completed", className: "text-success" };
    case "error":
      return { label: "Error", className: "text-danger" };
    default:
      return { label: "", className: "text-text-secondary" };
  }
}
