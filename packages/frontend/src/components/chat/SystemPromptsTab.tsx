import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { ResolvedSystemPrompt } from "@cc/shared/schemas";

import {
  useConversationSystemPromptsQuery,
  useSetConversationSystemPromptEnabledMutation,
} from "@/hooks/use-conversation-system-prompts-query";

type SystemPromptsTabProps = {
  conversationId: string;
  onEditInSettings?: () => void;
};

export function SystemPromptsTab({ conversationId, onEditInSettings }: SystemPromptsTabProps) {
  const query = useConversationSystemPromptsQuery(conversationId);
  const toggleMutation = useSetConversationSystemPromptEnabledMutation(conversationId);

  if (query.isLoading) {
    return <p className="px-4 py-6 text-center text-sm text-text-secondary">Loading…</p>;
  }

  if (query.error) {
    return (
      <p className="px-4 py-6 text-center text-sm text-danger">Failed to load system prompts.</p>
    );
  }

  const prompts = query.data ?? [];
  if (prompts.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-text-secondary">
        No system prompts configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <p className="px-1 text-xs text-text-secondary">
        These prompts are sent with every message in this conversation. Toggles apply to this
        conversation only.
      </p>
      {prompts.map((prompt) => (
        <SystemPromptCard
          key={prompt.id}
          prompt={prompt}
          onToggle={(enabled) => toggleMutation.mutate({ promptId: prompt.id, enabled })}
          onEditInSettings={onEditInSettings}
        />
      ))}
    </div>
  );
}

function SystemPromptCard({
  prompt,
  onToggle,
  onEditInSettings,
}: {
  prompt: ResolvedSystemPrompt;
  onToggle: (enabled: boolean) => void;
  onEditInSettings?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isEmpty = prompt.renderedBody.trim().length === 0;

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          )}
          <span className="truncate text-sm font-medium text-text-primary">{prompt.title}</span>
          {prompt.danger ? (
            <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-danger">
              Danger
            </span>
          ) : null}
        </button>
        <Toggle enabled={prompt.enabled} label={`Toggle ${prompt.title}`} onChange={onToggle} />
      </div>
      {expanded ? (
        <div className="border-t border-border px-3 py-2">
          {isEmpty ? (
            <p className="text-xs italic text-text-secondary">
              Empty / not configured — this prompt is not sent.
            </p>
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-text-primary">
              {prompt.renderedBody}
            </pre>
          )}
          {onEditInSettings ? (
            <button
              type="button"
              className="mt-2 text-xs text-accent hover:underline"
              onClick={onEditInSettings}
            >
              Edit in Settings
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  enabled,
  label,
  onChange,
}: {
  enabled: boolean;
  label: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
