import { CC_TOOL_CALL_TIMEOUT_MS } from "../mcp/cc-managed/live-request-timeouts.js";
import {
  parseWithCompat,
  toJsonSchemaCompat,
} from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import type { Tool } from "@opencode/sdk";

import type { CcManagedMcpServerDefinition } from "../mcp/cc-managed/server-registry.js";
import type { EmbeddedToolCaller } from "./embedded-tool-caller.js";

export function createEmbeddedCcTools(options: {
  directory: string;
  groups: readonly CcManagedMcpServerDefinition[];
  resolveCaller(directory: string, sessionID: string): Promise<EmbeddedToolCaller>;
  authorize(input: {
    toolID: string;
    caller: EmbeddedToolCaller;
    execution: Tool.Context;
  }): Promise<void>;
}): Tool.Info[] {
  return options.groups.flatMap((group) =>
    group.tools.map(
      (definition): Tool.Info => ({
        name: definition.name,
        description: definition.description,
        input: definition.inputSchema
          ? toJsonSchemaCompat(definition.inputSchema)
          : { type: "object", properties: {}, additionalProperties: false },
        ...(definition.outputSchema ? { output: toJsonSchemaCompat(definition.outputSchema) } : {}),
        options: { namespace: group.name, codemode: false },
        async execute(input, execution) {
          execution.signal.throwIfAborted();
          const caller = await options.resolveCaller(options.directory, execution.sessionID);
          if (definition.context !== "both" && definition.context !== caller.context) {
            throw new Error("CC tool is not available in this session context.");
          }
          await options.authorize({
            toolID: `${group.name}_${definition.name}`,
            caller,
            execution,
          });
          execution.signal.throwIfAborted();
          execution = {
            ...execution,
            signal: AbortSignal.any([
              execution.signal,
              AbortSignal.timeout(group.toolCallTimeoutMs ?? CC_TOOL_CALL_TIMEOUT_MS),
            ]),
          };
          const args: unknown = definition.inputSchema
            ? parseWithCompat(definition.inputSchema, input)
            : input;
          const result = await definition.execute(args, {
            agentSlug: caller.agentSlug,
            caller,
            signal: execution.signal,
            messageID: execution.messageID,
            callID: execution.id,
          });
          if (result.isError) {
            throw new Error(result.content.map((entry) => entry.text).join("\n"));
          }
          return {
            content: result.content,
            ...(definition.outputSchema && result.structuredContent
              ? { output: result.structuredContent }
              : {}),
          };
        },
      }),
    ),
  );
}
