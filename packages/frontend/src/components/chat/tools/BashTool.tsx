import { useCallback, useState } from "react";
import { Terminal } from "lucide-react";
import type { ToolRendererProps } from "./tool-registry";
import { getToolInput, getToolState } from "./tool-registry";
import { BasicTool } from "./BasicTool";

export function BashTool({ part }: ToolRendererProps) {
  const [copied, setCopied] = useState(false);
  const state = getToolState(part);
  const status = state?.["status"] as string | undefined;
  const input = getToolInput(part);
  const command = (input?.["command"] as string) ?? (input?.["description"] as string) ?? "";
  const output = state?.["output"] as string | undefined;

  const isRunning = status === "pending" || status === "running";

  const handleCopy = useCallback(() => {
    const text = command && output ? `$ ${command}\n\n${output}` : command || output || "";
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [command, output]);

  return (
    <BasicTool
      icon={<Terminal aria-hidden="true" className="h-3.5 w-3.5" />}
      title="Shell"
      subtitle={command}
      status={status}
      defaultExpanded
    >
      <div className="relative">
        <pre className="text-xs font-mono bg-surface-elevated rounded-md p-3 overflow-auto max-h-80 text-text-primary whitespace-pre-wrap">
          {command && <span className="text-text-secondary">$ {command}</span>}
          {isRunning && (
            <span className="ml-2 inline-flex gap-0.5">
              <span className="animate-pulse">.</span>
              <span className="animate-pulse animation-delay-200">.</span>
              <span className="animate-pulse animation-delay-400">.</span>
            </span>
          )}
          {output && (
            <>
              {command ? "\n\n" : ""}
              {output}
            </>
          )}
        </pre>
        {(command || output) && (
          <button
            type="button"
            className="absolute top-2 right-2 rounded-md bg-surface-elevated px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition"
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </BasicTool>
  );
}
