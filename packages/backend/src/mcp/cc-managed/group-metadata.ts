import type { SpecialistCapabilitySelection } from "@cc/shared/schemas";

import type { SystemPromptOverrides } from "../../system-prompts/types.js";

/**
 * Static, dependency-free metadata for each cc-managed MCP group. This is the
 * single source of truth for the group ↔ companion-instruction-prompt coupling,
 * so it can be read at system-prompt compose time without instantiating the
 * full registry (which needs services).
 *
 * `companionPromptId` links a group to the system-prompt definition that
 * documents it. The prompt is injected into a specialist's system prompt only
 * when the group is enabled for that specialist (see
 * `resolveCompanionPromptOverrides`). `null` means the group is covered by the
 * always-on global prompts and has no companion.
 *
 * `server-registry.ts` asserts every registered group appears here with a
 * matching `companionPromptId`, so adding a new group forces a decision here.
 */
export type CcManagedGroupMeta = {
  name: string;
  enabledByDefault: boolean;
  companionPromptId: string | null;
};

export const CC_MANAGED_GROUP_METAS: readonly CcManagedGroupMeta[] = [
  { name: "cc_default", enabledByDefault: true, companionPromptId: null },
  { name: "cc_default_interactive", enabledByDefault: true, companionPromptId: null },
  { name: "cc_app", enabledByDefault: false, companionPromptId: "mcp-instructions-app" },
  {
    name: "cc_specialist_management",
    enabledByDefault: false,
    companionPromptId: "mcp-instructions-specialist-management",
  },
  {
    name: "cc_tasks_management",
    enabledByDefault: false,
    companionPromptId: "mcp-instructions-tasks-management",
  },
  {
    name: "cc_notifications",
    enabledByDefault: false,
    companionPromptId: "mcp-instructions-notifications",
  },
] as const;

/** Anything carrying an `appMcpServers` selection (SpecialistCapabilitySelection or a task profile). */
type AppMcpSelectionSource = Pick<SpecialistCapabilitySelection, "appMcpServers">;

function isGroupEnabled(selection: AppMcpSelectionSource, meta: CcManagedGroupMeta): boolean {
  const entry = selection.appMcpServers?.find((server) => server.name === meta.name);

  if (!entry) {
    return meta.enabledByDefault;
  }

  return entry.enabled !== false && entry.action !== "deny";
}

/**
 * Map an effective capability selection to system-prompt enabled overrides for
 * every companion prompt: `{ [companionPromptId]: <group enabled> }`. Companion
 * prompts are capability-driven, so these overrides win over any per-conversation
 * toggle at compose time.
 */
export function resolveCompanionPromptOverrides(
  selection: AppMcpSelectionSource,
): SystemPromptOverrides {
  const overrides: SystemPromptOverrides = {};

  for (const meta of CC_MANAGED_GROUP_METAS) {
    if (meta.companionPromptId) {
      overrides[meta.companionPromptId] = isGroupEnabled(selection, meta);
    }
  }

  return overrides;
}
