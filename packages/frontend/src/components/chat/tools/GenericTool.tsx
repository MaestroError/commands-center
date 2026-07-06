import type { ReactNode } from "react";

import type { ConversationPart } from "@cc/shared/schemas";
import { CopyIdButton } from "../CopyIdButton";
import { getToolCallId, getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";
import { getToolIcon } from "./tool-icons";

type GenericToolProps = {
  part: ConversationPart;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function ToolDetail(props: { label: string; value: unknown; tone?: "default" | "danger" }) {
  const text = toText(props.value);
  const labelClass =
    props.tone === "danger"
      ? "text-xs font-medium text-danger mb-1"
      : "text-xs font-medium text-text-secondary mb-1";
  const preClass =
    props.tone === "danger"
      ? "text-xs bg-surface-elevated rounded-md p-3 overflow-auto max-h-60 text-danger"
      : "text-xs bg-surface-elevated rounded-md p-3 overflow-auto max-h-60 text-text-primary";

  return (
    <div>
      <p className={labelClass}>{props.label}</p>
      <div className="relative">
        <pre className={preClass}>{text}</pre>
        <CopyIdButton
          className="absolute top-2 right-2 rounded-md bg-surface p-1 text-text-secondary transition hover:text-text-primary"
          label={props.label.toLowerCase()}
          value={text}
        />
      </div>
    </div>
  );
}

export function GenericTool({ part }: GenericToolProps) {
  const toolName =
    (part["tool"] as string | undefined) ?? (part["name"] as string | undefined) ?? "Tool";
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = state?.["input"];
  const output = state?.["output"];
  const error = state?.["error"];

  const details: ReactNode[] = [];
  if (input !== undefined) details.push(<ToolDetail key="input" label="Input" value={input} />);
  if (output !== undefined) details.push(<ToolDetail key="output" label="Output" value={output} />);
  if (error !== undefined)
    details.push(<ToolDetail key="error" label="Error" tone="danger" value={error} />);

  return (
    <BasicTool
      copyValue={toolName}
      icon={getToolIcon(toolName)}
      title={toolName}
      status={status}
      callId={getToolCallId(part)}
    >
      {details.length > 0 ? (
        details
      ) : (
        <p className="text-xs text-text-secondary">No details available.</p>
      )}
    </BasicTool>
  );
}
