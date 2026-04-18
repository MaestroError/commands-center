import type { ToolRendererProps } from "./tool-registry";
import { getToolInput, getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";

export function TaskTool({ part }: ToolRendererProps) {
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = getToolInput(part);

  const subagentType = (input?.["subagent_type"] as string) ?? "Task";
  const description = (input?.["description"] as string) ?? "";
  const title = subagentType.charAt(0).toUpperCase() + subagentType.slice(1);

  return <BasicTool title={title} subtitle={description} status={status} hideDetails />;
}
