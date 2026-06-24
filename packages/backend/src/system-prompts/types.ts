import type { SystemPromptScope } from "@cc/shared/schemas";

export type { SystemPromptScope };

/**
 * A code-shipped prompt definition. The default body is an inline template
 * literal (no runtime FS discovery — the CLI bundles to a single file). User
 * edits live as workspace `.md` files and override `defaultBody` at resolve
 * time; see `system-prompt-service.ts`.
 */
export type SystemPromptDefinition = {
  /** Stable key, e.g. "global-chat". */
  id: string;
  /** Display title, e.g. "Global (Chat)". */
  title: string;
  /** Shown in Settings + the chat sidebar. */
  description: string;
  scope: SystemPromptScope;
  /** Composition order in the joined `system` string (ascending). */
  order: number;
  /** When true, an empty default body contributes nothing until edited. */
  optional: boolean;
  /** When true, Settings shows a danger note (affects every specialist). */
  danger: boolean;
  /** Default for the per-conversation enabled toggle. */
  enabledByDefault: boolean;
  /** Save location relative to the workspace, e.g. "configuration/system-prompts/identity.md". */
  workspaceRelativePath: string;
  /** Subset of variable-catalog ids this prompt renders. */
  variables: string[];
  /** Shipped default markdown/XML body (with `{{ VAR }}` placeholders). */
  defaultBody: string;
};

/**
 * Everything a variable resolver may read. Specialist and task fields are
 * absent in contexts where they do not apply (e.g. task fields in a chat),
 * and their resolvers return an empty string then.
 */
export type SystemPromptRenderContext = {
  appName: string;
  /** ISO-8601 server date at send time. */
  currentDate: string;
  workspaceDir: string;
  conversationId?: string;
  specialist?: {
    name: string;
    slug: string;
    role: string;
    instructions: string;
  };
  task?: {
    id: string;
    title: string;
    runId: string;
  };
};

/** A single variable in the catalog. */
export type SystemPromptVariable = {
  label: string;
  description: string;
  resolve: (ctx: SystemPromptRenderContext) => string;
};

/** The `system` string plus the per-prompt snapshot of what went into it. */
export type ComposedSystemPrompt = {
  system: string;
  prompts: Array<{
    id: string;
    title: string;
    renderedBody: string;
    enabled: boolean;
  }>;
};

/** A definition resolved against a context, keeping disabled/empty entries flagged. */
export type ResolvedSystemPrompt = {
  id: string;
  title: string;
  description: string;
  scope: SystemPromptScope;
  danger: boolean;
  optional: boolean;
  enabled: boolean;
  isCustomized: boolean;
  renderedBody: string;
};

/** Per-conversation enabled overrides: prompt id → enabled. */
export type SystemPromptOverrides = Record<string, boolean>;
