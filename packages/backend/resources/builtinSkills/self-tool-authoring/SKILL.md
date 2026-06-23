---
name: self-tool-authoring
description: Create or revise OpenCode custom tools only for this specialist inside its own workspace. Use when the user wants this specialist to add a private local tool, improve its own .opencode/tools code, or capture a repeated tool behavior that should not become a global CommandsCenter custom tool.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# self-tool-authoring

Use this skill when creating or updating a specialist-local OpenCode tool for this specialist only.

## Scope

- Create specialist-local tools under `.opencode/tools/` in this specialist's workspace.
- Treat `.opencode/tools/` as private to this specialist. Other specialists will not receive these tools automatically.
- Use `global-tool-authoring` instead when the user wants a reusable CommandsCenter global tool that can be enabled for one or more specialists.
- Do not edit `.cc/workspace/custom-tools/` when the user asks for a self-tool.
- Do not create or edit `cc-tool.json` or `.cc-tool-copy.json` metadata for self-tools. Those files belong to CommandsCenter's global tool copy flow.

## Before writing

Clarify the local tool's intent before editing files:

- What should the tool do that normal prompting would repeat or handle unreliably?
- What arguments should the model provide?
- What output should the tool return to the model?
- Does it need files, helper code, external services, or environment variables?
- Is this tool truly private to this specialist, or should it be global and reusable?

If the current conversation already contains the tool behavior, extract the answers from the conversation first. Ask the user only for gaps that materially affect the implementation.

## Required structure

Use a single top-level TypeScript or JavaScript file for the callable tool:

```text
.opencode/tools/
  release-helper.ts
```

Use a same-name support directory only when helper files are needed:

```text
.opencode/tools/
  release-helper.ts
  release-helper/
    fixtures/
    helper.ts
```

- Tool filenames should be lowercase kebab-case.
- The OpenCode callable name comes from the top-level file name.
- Prefer TypeScript unless the local workspace clearly uses JavaScript.
- Keep helper files next to the tool so the specialist workspace remains self-contained.

## OpenCode tool contract

Prefer the `tool()` helper:

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

- Use one default export per local tool unless the user explicitly asks for multiple exports.
- Define arguments in `args` using `tool.schema`, which is Zod exposed by OpenCode.
- Every argument should have a `.describe(...)` string that tells the model when and how to fill it.
- Use `args: {}` for no-argument tools.
- Return strings or JSON-serializable values that are concise and useful to the model.

## Argument design

- Keep argument names camelCase, specific, and stable.
- Prefer narrow schemas over vague strings when the shape is known.
- Use optional fields and defaults only when they improve model behavior.
- Validate external input at the tool boundary. The argument schema is the boundary for model-provided input.
- Avoid built-in OpenCode tool names such as `bash`, `read`, `write`, `edit`, `grep`, `glob`, `webfetch`, `task`, `todo`, `skill`, or `apply_patch` unless the user explicitly wants to override one.

## Secrets and environment

- Never hard-code secrets, tokens, API keys, private URLs, or credentials in tool source, examples, tests, or documentation.
- Read secrets from environment variables, for example `process.env.LINEAR_API_KEY`.
- Document required environment variable names near the tool or in the final response.
- If a secret is not available, ask the user how they want it provided. Do not ask the user to paste secrets into chat.
- Use fake values such as `test-token` only for local tests that do not call real external systems.

## Execution context

The `execute(args, context)` function receives OpenCode session context.

- Use `context.directory` for the current session working directory.
- Use `context.worktree` for the git worktree root.
- Other useful fields include `context.agent`, `context.sessionID`, and `context.messageID`.
- Avoid absolute paths outside this specialist's workspace unless the user explicitly requested a machine-local dependency.

## Dependencies and helper code

- Prefer Node built-ins and dependencies already available to the CommandsCenter/OpenCode runtime.
- Do not introduce dependency installation steps for self-tools unless the user explicitly accepts the portability tradeoff.
- If a helper script is useful, keep it inside the same-name support directory under `.opencode/tools/`.
- If you need to run another process, use safe argument passing from JavaScript APIs. Do not build shell commands by concatenating untrusted model arguments.
- For HTTP tools, prefer `fetch`, validate required URL parts, and return a compact response with status and relevant body fields.

## External calls and timeouts

- Set an explicit timeout on any call to a third-party service, especially HTTP requests. A slow or hung local tool blocks this specialist's session until it is cancelled.
- Define a named timeout constant and pass `AbortSignal.timeout(...)`, then handle non-OK responses and timeout errors:

```typescript
const REQUEST_TIMEOUT_MS = 60_000;

const response = await fetch(endpoint, {
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
});

if (!response.ok) {
  throw new Error(`Request failed: ${response.status} ${response.statusText}`);
}

return await response.text();
```

## Testing workflow

- If the test path is obvious and local-only, test the tool before reporting completion.
- Use deterministic fixtures in the tool's support directory when useful.
- If the tool needs real external systems, credentials, production-like data, or unclear business rules, ask the user what test data and environment to use.
- Report exactly what was tested and what was not tested.

## Final sanity check

Before finishing a new or revised self-tool:

- Confirm the tool lives under `.opencode/tools/`, not `.cc/workspace/custom-tools/`.
- Confirm no CommandsCenter metadata files were created for it.
- Confirm argument schemas are narrow, described, and safe for model-provided input.
- Confirm secrets are referenced through environment variables, not written into source.
- Confirm third-party calls set explicit timeouts.
- Confirm the tool belongs only to this specialist. If it should be shared, suggest creating a global tool with `global-tool-authoring`.

## Next steps after authoring

When the self-tool is ready, tell the user it is available only to this specialist because it lives under this specialist's `.opencode/tools/` folder. If OpenCode does not notice the new tool immediately, suggest restarting or refreshing this specialist's OpenCode session. If the user wants the same tool for other specialists, suggest creating a global CommandsCenter tool with `global-tool-authoring` and enabling it from the CommandsCenter Tools page.

## Output style

- Include the exact local paths created or edited.
- Include a compact summary of the tool arguments, environment variables, and test result.
- End by stating that the tool is specialist-local unless the user already asked to promote it to a global tool.
