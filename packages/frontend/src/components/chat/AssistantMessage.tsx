import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { Markdown } from "./Markdown";
import { ContextGroup } from "./tools/ContextGroup";
import { GenericTool } from "./tools/GenericTool";
import { ToolErrorCard } from "./tools/ToolErrorCard";
import { BashTool } from "./tools/BashTool";
import { TaskTool } from "./tools/TaskTool";
import { QuestionTool } from "./tools/QuestionTool";
import {
  getToolName,
  getToolStatus,
  HIDDEN_TOOLS,
  registerTool,
  resolveToolRenderer,
} from "./tools/tool-registry";
import { groupParts, type GroupedEntry } from "./tools/group-parts";

// Register specialized tool renderers
registerTool("bash", BashTool);
registerTool("task", TaskTool);
registerTool("question", QuestionTool);

type AssistantMessageProps = {
  message: ConversationMessage;
  parts: ConversationPart[];
};

// Internal part types that should not be rendered as visible content
const HIDDEN_PART_TYPES = new Set(["step-start", "step-finish", "reasoning", "patch", "input"]);

function renderToolPart(part: ConversationPart) {
  const name = getToolName(part);
  const status = getToolStatus(part);

  if (HIDDEN_TOOLS.has(name)) return null;

  // Error state: render error card
  if (status === "error") {
    return <ToolErrorCard part={part} />;
  }

  // Try specialized renderer
  const Renderer = resolveToolRenderer(name);
  if (Renderer) {
    return <Renderer part={part} />;
  }

  // Fallback to generic
  return <GenericTool part={part} />;
}

function renderPart(part: ConversationPart) {
  if (HIDDEN_PART_TYPES.has(part.type)) return null;

  switch (part.type) {
    case "text":
      return <Markdown className="cc-md--chat" content={(part["text"] as string) ?? ""} />;
    case "tool":
      return renderToolPart(part);
    default:
      return null;
  }
}

function renderGroupedEntry(entry: GroupedEntry, index: number) {
  if (entry.type === "context") {
    return (
      <div key={`ctx-${String(index)}`}>
        <ContextGroup parts={entry.parts} />
      </div>
    );
  }

  const rendered = renderPart(entry.part);
  if (!rendered) return null;
  return <div key={entry.part.id}>{rendered}</div>;
}

export function AssistantMessage({ message, parts }: AssistantMessageProps) {
  const hasParts = parts.length > 0;
  const messageError = message.error?.message;

  if (messageError && !hasParts && !message.content) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text-primary">
        <p>{messageError}</p>
      </div>
    );
  }

  if (!hasParts) {
    return (
      <div className="space-y-3">
        <Markdown className="cc-md--chat" content={message.content} />
      </div>
    );
  }

  const grouped = groupParts(parts);
  const renderedEntries = grouped.map((entry, i) => renderGroupedEntry(entry, i));
  const hasVisible = renderedEntries.some(Boolean);

  if (!hasVisible) {
    if (!message.content && !messageError) return null;
    return (
      <div className="space-y-3">
        {message.content ? <Markdown className="cc-md--chat" content={message.content} /> : null}
        {messageError ? <p className="text-sm text-danger">{messageError}</p> : null}
      </div>
    );
  }

  return <div className="space-y-3">{renderedEntries}</div>;
}
