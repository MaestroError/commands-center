import {
  deriveMcpToolName,
  isReservedMcpToolName,
  mcpToolNameSchema,
  taskTemplateMcpConfigSchema,
  type TaskTemplateMcpConfig,
  type TaskTemplateMcpConfigInput,
} from "@cc/shared/schemas";

import { BadRequestError, ConflictError } from "../../lib/api-error.js";

/** The default MCP config for a template with no stored config, derived from its title. */
export function defaultMcpConfigForTitle(title: string): TaskTemplateMcpConfig {
  return taskTemplateMcpConfigSchema.parse({ toolName: deriveMcpToolName(title) });
}

/** Parse a stored `mcp_config_json`, falling back to the title-derived default. */
export function parseMcpConfigOrDefault(json: string | null, title: string): TaskTemplateMcpConfig {
  if (!json) {
    return defaultMcpConfigForTitle(title);
  }
  return taskTemplateMcpConfigSchema.parse(JSON.parse(json) as unknown);
}

/**
 * Merge an input config over the existing (or title-derived) config. The tool
 * name is only re-derived as the default on create; an existing name is never
 * silently overwritten by a title change.
 */
export function resolveMcpConfig(options: {
  title: string;
  input?: TaskTemplateMcpConfigInput;
  existing?: TaskTemplateMcpConfig;
}): TaskTemplateMcpConfig {
  const base = options.existing ?? defaultMcpConfigForTitle(options.title);
  const input = options.input ?? {};
  const toolNameInput = input.toolName?.trim();
  const candidateName = toolNameInput && toolNameInput.length > 0 ? toolNameInput : base.toolName;

  const parsedName = mcpToolNameSchema.safeParse(candidateName);
  if (!parsedName.success) {
    throw new BadRequestError(parsedName.error.issues[0]?.message ?? "Invalid MCP tool name.");
  }

  return taskTemplateMcpConfigSchema.parse({
    syncEnabled: input.syncEnabled ?? input.exposeAsTool ?? base.syncEnabled,
    toolName: parsedName.data,
    toolDescription: input.toolDescription ?? base.toolDescription,
    textFieldDescription: input.textFieldDescription ?? base.textFieldDescription,
    allowFiles: input.allowFiles ?? base.allowFiles,
    filesFieldDescription: input.filesFieldDescription ?? base.filesFieldDescription,
    asyncEnabled: input.asyncEnabled ?? base.asyncEnabled,
    asyncAlwaysAcknowledge: input.asyncAlwaysAcknowledge ?? base.asyncAlwaysAcknowledge,
    artifacts: {
      displayableUrlEnabled:
        input.artifacts?.displayableUrlEnabled ?? base.artifacts.displayableUrlEnabled,
      downloadableUrlEnabled:
        input.artifacts?.downloadableUrlEnabled ?? base.artifacts.downloadableUrlEnabled,
    },
  });
}

/** Reject a tool name that collides with a reserved core name or another template. */
export function assertMcpToolNameAvailable(
  toolName: string,
  takenToolNames: ReadonlySet<string>,
): void {
  if (isReservedMcpToolName(toolName)) {
    throw new BadRequestError(`MCP tool name '${toolName}' is reserved and cannot be used.`);
  }
  if (takenToolNames.has(toolName)) {
    throw new ConflictError(`MCP tool name '${toolName}' is already used by another template.`);
  }
}
