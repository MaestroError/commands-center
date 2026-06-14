---
name: custom-tool-authoring
description: Author portable OpenCode custom tools that fit CommandsCenter's workspace contract.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# custom-tool-authoring

Use this skill when creating or updating custom OpenCode tools for CommandsCenter.

## Start Here

- Before creating or editing a custom tool, check whether you have the required CommandsCenter MCP tools available.
- Custom tool creation must use the `cc_tool_management` MCP server. Do not create tool metadata or starter directories manually when the MCP tool is available.
- If the required MCP server or tool is missing, stop and ask the user to enable the needed MCP server and tools for this specialist. Be specific: ask for `cc_tool_management_*` and the required tool, such as `create_custom_tool`.
- If the requested tool needs stored credentials or tokens, check if you have `cc_app_add_secret` tool available. If not, ask the user to enable that tool too.

## Scope

- Create only global CommandsCenter custom tools, only using `cc_tool_management_*` MCP server tools.
- `create_custom_tool` creates a global tool scaffold under and returns directory you should use for further development.
- Do not offer specialist-local tool creation as an option.
- When a global tool needs to be assigned to a specialist, use CommandsCenter's managed copy flow from `cc_tool_management_*` instead of writing into a specialist workspace manually.

## Required Creation Flow

1. Confirm the tool purpose, expected inputs, expected output, and any external services it needs.
2. Use `cc_tool_management_create_custom_tool` to create the global tool scaffold.
3. Edit the created global tool files under the provided directory.
4. Implement `tool.ts` with a default OpenCode tool export.
5. Keep helper files next to `tool.ts` inside the global tool directory.
6. Do not manage CommandsCenter metadata fields, IDs, timestamps, or fingerprints manually.
7. When finished, ask the user whether they want this tool enabled for any existing specialist now.
8. If the user wants it enabled, use the CommandsCenter managed flow, such as `cc_tool_management_copy_custom_tool_to_specialist`, when that tool is available. When not, Do not write directly into a specialist workspace, Ask user to enable the tool for specific specialists from CC's Tools page.

## Global Tool Layout

CommandsCenter global tools use this structure:

```text
.cc/workspace/custom-tools/<slug>/
  cc-tool.json
  tool.ts
  optional-helper.ts
  optional-script.py
```

- `<slug>` is lowercase kebab-case derived from the user-facing name, limited to simple ASCII letters, numbers, and hyphens.
- `tool.ts` is the single primary OpenCode tool entry file.
- `cc-tool.json` is CommandsCenter metadata used for discovery and rendering without importing arbitrary tool code.
- Treat `cc-tool.json` as CC-owned after scaffold creation. Do not manually edit it unless the user is deliberately repairing metadata.
- Do not ask the user to manage fingerprints. CommandsCenter computes and refreshes fingerprints when it creates, reads, copies, imports, or indexes tools.

## OpenCode Tool File Contract

Custom tools are TypeScript or JavaScript files that export a tool definition. Prefer TypeScript and the `tool()` helper:

```typescript
import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Draft release notes from recent git history.",
  args: {
    since: tool.schema.string().describe("Git revision, tag, or date to start from"),
    includeBreakingChanges: tool.schema
      .boolean()
      .describe("Whether to call out possible breaking changes"),
  },
  async execute(args, context) {
    return `Drafting release notes since ${args.since} in ${context.directory}`;
  },
});
```

- Use one default export per tool.
- The default export creates a tool named after the file used by OpenCode after CommandsCenter copies it to a specialist.
- OpenCode also supports multiple named exports from one file, named `<filename>_<exportName>`, but CommandsCenter tools should use one default export per tool unless the user explicitly asks otherwise.
- Custom tools can override built-in OpenCode tools if they use the same name. Avoid built-in names such as `bash`, `read`, `write`, `edit`, `grep`, `glob`, `webfetch`, `task`, `todo`, `skill`, or `apply_patch` unless the user explicitly wants an override.

## Arguments

- Define arguments in `args` using `tool.schema`, which is Zod exposed by OpenCode.
- Every argument should have a `.describe(...)` string that tells the model when and how to fill it.
- Keep names camelCase, specific, and stable. Prefer `repositoryPath`, `ticketId`, or `includeDrafts` over vague names like `input` or `data`.
- Use the narrowest practical schema: `string`, `number`, `boolean`, `array`, `object`, `enum`, optional fields, and defaults when useful.
- For no-argument tools, use `args: {}`.
- Validate external data at the boundary. The `args` schema is the boundary for model-provided input.

You may import Zod directly if needed:

```typescript
import { z } from "zod";

export default {
  description: "Look up a ticket by ID.",
  args: {
    ticketId: z.string().min(1).describe("Ticket identifier, for example CC-123"),
  },
  async execute(args) {
    return `Ticket: ${args.ticketId}`;
  },
};
```

## Secrets And Environment

- Never hard-code secrets, tokens, API keys, private URLs, or credentials in tool source, metadata, examples, tests, or documentation.
- Tools must read secrets from environment variables, for example `process.env.LINEAR_API_KEY`.
- Document required environment variable names in the tool description or a nearby README.
- If the tool needs a secret that is not already available, use `cc_app_add_secret` to ask the operator for it and store it through CommandsCenter.
- If `cc_app_add_secret` is unavailable, stop and ask the user to enable the `cc_app` MCP server and the `add_secret` tool for this specialist or instruct to add the secret manually from settings.
- Keep test fixtures secret-free. Use fake tokens like `test-token` only when a real external call is not made.

## Execution Context

The `execute(args, context)` function receives OpenCode session context.

- Use `context.directory` for the current session working directory.
- Use `context.worktree` for the git worktree root.
- Other useful fields include `context.agent`, `context.sessionID`, and `context.messageID`.
- Avoid absolute paths that point outside the CommandsCenter workspace unless the user explicitly requested them.
- Keep outputs concise and useful for the model. Return strings or JSON-serializable data that summarizes the result.

## Dependencies And Helper Code

- The tool definition itself must be TypeScript or JavaScript.
- A tool may call helper scripts in other languages, but keep those scripts inside the global tool directory so the tool remains portable with `.cc/workspace`.
- Prefer Node built-ins and dependencies already available to the CommandsCenter/OpenCode runtime.
- Do not introduce dependency installation steps for MVP tools unless the user explicitly accepts the portability tradeoff.
- If you need to run another process, use safe argument passing from JavaScript APIs. Do not build shell commands by concatenating untrusted model arguments.
- For HTTP tools, prefer `fetch`, validate required URL parts, set timeouts where practical, and return a compact response with status and relevant body fields.

## Naming Rules

- Tool slug and file names should be kebab-case: `release-helper`, `ticket-lookup`, `sync-linear-issue`.
- Exported JavaScript identifiers, helper functions, and argument names should be camelCase.
- The user-facing `name` in CC metadata can use title case with spaces.
- The OpenCode callable name comes from the top-level copied `.opencode/tools/<name>.ts` filename, so renaming files changes the tool name.
- Check for duplicate global tool names before creating a tool when the catalog is available.

## Testing Workflow

- If the test path is obvious and local-only, test the tool yourself before reporting completion. Examples: calculators, string formatters, parsers, local file transforms, deterministic data extraction, or tools that can run entirely against fake fixtures.
- If the tool needs real external systems, credentials, production-like data, or unclear business rules, ask the user what test data and environment you should use.
- If the tool uses secrets, do not ask the user to paste secrets into chat. Use `cc_app_add_secret` when a secret must be provided.
- Prefer deterministic fixtures in the global tool directory for local tests.
- Report exactly what was tested and what was not tested.

## Review Checklist

- The tool was created through `cc_tool_management_create_custom_tool`.
- The tool lives under `.cc/workspace/custom-tools/<slug>/`.
- No files were written directly under a specialist `.opencode/tools/` directory.
- Argument schemas are narrow, described, and safe for model-provided input.
- The tool name does not accidentally collide with a built-in OpenCode tool.
- Helper files and scripts are portable with the workspace.
- Secrets are referenced through environment variables, not written into source.
- Required secrets are collected with `cc_app_add_secret` when needed.
- The tool was tested when a safe local test path was clear, or the user was asked for test data when it was not clear.
- The user was asked whether to enable the finished tool for one or more specialists.

## Output Style

- Be explicit about required MCP capabilities when they are missing.
- Include the exact global paths created or edited.
- Include a compact summary of the tool arguments, environment variables, and test result.
- At the end, ask whether the user wants to enable the finished global tool for any specialist unless they already answered that.
