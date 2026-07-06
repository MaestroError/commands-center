import { Sparkles } from "lucide-react";

import type { ToolRendererProps } from "./tool-registry";
import { getToolCallId, getToolInput, getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";

export function TaskTool({ part }: ToolRendererProps) {
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = getToolInput(part);

  const subagentType = (input?.["subagent_type"] as string) ?? "Task";
  const description = (input?.["description"] as string) ?? "";
  const title = subagentType.charAt(0).toUpperCase() + subagentType.slice(1);

  return (
    <BasicTool
      icon={<Sparkles aria-hidden="true" className="h-3.5 w-3.5" />}
      title={title}
      subtitle={description}
      status={status}
      callId={getToolCallId(part)}
      hideDetails
    />
  );
}
