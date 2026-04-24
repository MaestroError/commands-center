import type { ConversationPart } from "@cc/shared/schemas";
import { getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";

type GenericToolProps = {
  part: ConversationPart;
};

export function GenericTool({ part }: GenericToolProps) {
  const toolName =
    (part["tool"] as string | undefined) ?? (part["name"] as string | undefined) ?? "Tool";
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = state?.["input"];
  const output = state?.["output"];
  const error = state?.["error"];

  const hasDetails = input !== undefined || output !== undefined || error !== undefined;

  return (
    <BasicTool copyValue={toolName} title={toolName} status={status}>
      {hasDetails ? (
        <>
          {input !== undefined && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Input</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-text-primary">
                {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output !== undefined && (
            <div>
              <p className="text-xs font-medium text-text-secondary mb-1">Output</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-text-primary">
                {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          )}
          {error !== undefined && (
            <div>
              <p className="text-xs font-medium text-danger mb-1">Error</p>
              <pre className="text-xs bg-surface rounded-md p-3 overflow-auto max-h-60 text-danger">
                {typeof error === "string" ? error : JSON.stringify(error, null, 2)}
              </pre>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-text-secondary">No details available.</p>
      )}
    </BasicTool>
  );
}
