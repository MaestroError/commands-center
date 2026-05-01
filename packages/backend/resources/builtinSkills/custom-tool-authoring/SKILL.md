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

## First decision: global or agent-local

- Put reusable tools in the CommandsCenter global library: `.cc/workspace/custom-tools/<slug>/`.
- Put one-off tools directly in one agent workspace: `.cc/workspace/agents/<agent-slug>/.opencode/tools/`.
- Prefer the global library unless the user clearly says the tool belongs only to one agent.
- Global tools are source assets. Agent tools are copied snapshots. A change in the global library does not automatically update agent copies. User should explicitly choose when to copy, replace, move, or copy-back tools between global and agent scopes via CC UI.
- If an agent copy has diverged from the global source, say so and recommend an explicit copy, replace, move, or copy-back action instead of pretending they sync.

## Preferred creation flow

- If CommandsCenter provides a starter/template creator, use it before writing files by hand. The app's custom tools page already creates the required starter files from a name and description.
- If a CLI helper exists, prefer a command shaped like `ccenter create-tool --name "Tool Name" --description "What it does"` and use the returned global tool directory path.
- If no helper exists, create the files manually using the layout below.

## Global tool layout

Use this structure for reusable tools:

```text
.cc/workspace/custom-tools/<slug>/
  cc-tool.json
  tool.ts
  optional-helper.ts
  optional-script.py
```

- `<slug>` is lowercase kebab-case derived from the user-facing name, limited to simple ASCII letters, numbers, and hyphens.
- `tool.ts` is the single primary OpenCode tool entry file for MVP global tools.
- `cc-tool.json` is CommandsCenter metadata used for discovery and rendering without importing arbitrary tool code.
- Do not ask the user to manage fingerprints. CommandsCenter computes and refreshes fingerprints when it creates, reads, copies, imports, or indexes tools.
- Do not manually edit CC-owned metadata fields unless the user is deliberately repairing metadata. If manual creation is unavoidable, include only the metadata needed for CC to discover the tool and let CC refresh computed fields later.

Minimum metadata shape for manual global creation:

```json
{
  "version": 1,
  "id": "replace-with-generated-id-if-no-helper-exists",
  "slug": "release-helper",
  "name": "Release Helper",
  "description": "Draft release notes from recent changes.",
  "entryFile": "tool.ts",
  "createdAt": "2026-05-01T00:00:00.000Z",
  "updatedAt": "2026-05-01T00:00:00.000Z",
  "enabled": true
}
```

If the current implementation still requires a fingerprint field when reading metadata, prefer using the app/API/template creator instead of hand-writing `cc-tool.json`. If forced to unblock a manual draft, use a temporary non-empty placeholder and tell the user CC should regenerate it on the next indexing pass.

## Agent-local layout

OpenCode discovers local project tools from `.opencode/tools/` inside the active agent workspace.

For an agent-only tool, a simple direct file is valid:

```text
.cc/workspace/agents/<agent-slug>/.opencode/tools/<tool-name>.ts
```

For a CC-managed copy from the global library, CommandsCenter uses a wrapper plus support directory:

```text
.cc/workspace/agents/<agent-slug>/.opencode/tools/<slug>.ts
.cc/workspace/agents/<agent-slug>/.opencode/tools/<slug>/tool.ts
.cc/workspace/agents/<agent-slug>/.opencode/tools/<slug>.cc-tool-copy.json
```

- The top-level `<slug>.ts` file is required because OpenCode names tools from files directly under `.opencode/tools/`.
- The support directory contains the copied global implementation and helper files.
- The `.cc-tool-copy.json` file marks CC-managed copied snapshots and records copy provenance for drift detection.
- Do not remove or overwrite non-CC-managed agent-local tools unless the user explicitly asks.

## OpenCode tool file contract

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

- The default export creates a tool named after the file. In CC global tools, copied agents ultimately expose the top-level wrapper filename, usually `<slug>`.
- OpenCode also supports multiple named exports from one file, named `<filename>_<exportName>`, but CommandsCenter MVP should use one default export per tool.
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

## Execution context

The `execute(args, context)` function receives OpenCode session context.

- Use `context.directory` for the current session working directory.
- Use `context.worktree` for the git worktree root.
- Other useful fields include `context.agent`, `context.sessionID`, and `context.messageID`.
- Avoid absolute paths that point outside the CommandsCenter workspace unless the user explicitly requested them.
- Keep outputs concise and useful for the model. Return strings or JSON-serializable data that summarizes the result.

## Dependencies and helper code

- The tool definition itself must be TypeScript or JavaScript.
- A tool may call helper scripts in other languages, but keep those scripts inside the tool directory so the tool remains portable with `.cc/workspace`.
- Prefer Node built-ins and dependencies already available to the CommandsCenter/OpenCode runtime.
- Do not introduce dependency installation steps for MVP tools unless the user explicitly accepts the portability tradeoff.
- If you need to run another process, use safe argument passing from JavaScript APIs. Do not build shell commands by concatenating untrusted model arguments.
- If you use environment variables or secrets, document the required names in the tool description or adjacent README, but never hard-code secrets.
- For HTTP tools, prefer `fetch`, validate required URL parts, set timeouts where practical, and return a compact response with status and relevant body fields.

## Naming rules

- Tool slug and file names should be kebab-case: `release-helper`, `ticket-lookup`, `sync-linear-issue`.
- Exported JavaScript identifiers, helper functions, and argument names should be camelCase.
- The user-facing `name` in CC metadata can use title case with spaces.
- The OpenCode callable name comes from the top-level `.opencode/tools/<name>.ts` filename, so renaming files changes the tool name.
- Check for duplicate names in the same scope before creating a tool.

## Editing workflow

1. Decide whether the tool is global or agent-local.
2. Use the starter creator when available; otherwise create the correct directory and files manually.
3. Implement `tool.ts` with a default `tool({ description, args, execute })` export.
4. Put helper files next to the global `tool.ts`, or in the agent support directory for copied tools.
5. Do not manage fingerprints by hand.
6. If assigning a global tool to an agent, copy through CommandsCenter so the wrapper and `.cc-tool-copy.json` metadata are created correctly.
7. After changing assigned agent tools, expect the affected OpenCode instance to need disposal/reload before it sees the new files.

## Review checklist

- The tool lives under `.cc/workspace`, not in a host-global directory like `~/.config/opencode/tools`.
- Global tools use `.cc/workspace/custom-tools/<slug>/tool.ts`.
- Agent-discovered tools have a top-level `.opencode/tools/<tool-name>.ts` or `.js` file.
- Argument schemas are narrow, described, and safe for model-provided input.
- The tool name does not accidentally collide with a built-in OpenCode tool.
- Helper files and scripts are portable with the workspace.
- Secrets are referenced through environment variables, not written into source.
- Agent copies are treated as snapshots, with drift called out when relevant.

## Output style

- Prefer practical file-by-file instructions.
- Say whether the change belongs in the global library or a single agent workspace.
- Include the exact paths to create or edit.
- Include a compact `tool.ts` example when authoring a new tool.
- Call out when a copied agent tool has diverged and should be copied, replaced, moved, or copied back to global.
