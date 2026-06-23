import { useMemo } from "react";

import type { SystemPromptVariableMeta } from "@cc/shared/schemas";

import { ErrorState, LoadingState } from "@/components/common/PageStates";
import { useSystemPromptsQuery } from "@/hooks/use-system-prompts-query";

import { SystemPromptCard } from "./SystemPromptCard";

// Presentation order (Additional first, as requested). Independent of the
// backend composition order that governs what the model sees.
const DISPLAY_ORDER = ["additional", "global-chat", "global-task", "identity"];

export function SystemPromptsTab() {
  const query = useSystemPromptsQuery();

  const variablesById = useMemo(() => {
    const map = new Map<string, SystemPromptVariableMeta>();
    for (const variable of query.data?.variables ?? []) {
      map.set(variable.id, variable);
    }
    return map;
  }, [query.data?.variables]);

  if (query.isLoading) {
    return <LoadingState />;
  }

  if (query.error) {
    return (
      <ErrorState
        title="Could not load system prompts"
        description="Something went wrong while loading the system prompt templates. Try again."
      />
    );
  }

  const prompts = query.data?.prompts ?? [];
  const ordered = [...prompts].sort((a, b) => indexOf(a.id) - indexOf(b.id));

  return (
    <div className="mt-4 grid gap-3">
      <p className="text-sm text-text-secondary">
        These templates are composed and sent with every message. Edits are saved as workspace
        files; reset restores the shipped default.
      </p>
      {ordered.map((prompt) => (
        <SystemPromptCard
          key={prompt.id}
          prompt={prompt}
          variables={prompt.variables
            .map((id) => variablesById.get(id))
            .filter((variable): variable is SystemPromptVariableMeta => Boolean(variable))}
        />
      ))}
    </div>
  );
}

function indexOf(id: string): number {
  const index = DISPLAY_ORDER.indexOf(id);
  return index === -1 ? DISPLAY_ORDER.length : index;
}
