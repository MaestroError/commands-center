# Per-Workspace MCP Configuration

## Overview

OpenCode supports a two-layer MCP configuration model:

1. **Global layer** — MCP servers are defined once (root `opencode.jsonc` or the `mcp_servers` DB table) with full connection details and authentication.
2. **Workspace layer** — Each specialist workspace contains its own `opencode.jsonc` that overrides only what's needed: enable/disable servers and set per-tool permission rules.

This separation means CC manages authentication and connection setup globally (provider connections, Composio OAuth, API keys), while the Specialist editor controls which tools each specialist can access.

## Workspace File Layout

Each specialist workspace is a directory with three entries:

```
specialists/<specialist-slug>/
├── AGENTS.md              # OpenCode system prompt (name, role, instructions)
├── opencode.jsonc         # Model, MCP overrides, permission rules
└── .opencode/skills/      # Copied skill files
```

OpenCode merges the workspace `opencode.jsonc` over the global config at runtime. Workspace-level entries override their global counterparts by key.

## Global MCP Server Definition

The root `opencode.jsonc` defines servers with full connection details. This is the only place where transport, authentication, and credentials are specified:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp@latest"],
      "enabled": true,
    },
    "github": {
      "type": "remote",
      "url": "https://api.github-mcp.example.com/mcp",
      "enabled": true,
      "oauth": true,
    },
    "composio": {
      "type": "remote",
      "url": "https://mcp.composio.dev/mcp",
      "enabled": true,
      "headers": {
        "X-API-KEY": "{file:.secrets/composio-api-key}",
      },
    },
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true,
      "oauth": false,
      "headers": {
        "CONTEXT7_API_KEY": "{file:.secrets/context7-api-key}",
      },
    },
  },
}
```

OpenCode handles all OAuth flows and credential management at this level. Workspace configs never redefine connection details — they only toggle servers and tools.

## Workspace `opencode.jsonc` Schema

The workspace config uses a strict subset of the global schema:

```ts
// From workspace-contract.ts
const workspaceConfigSchema = z
  .object({
    $schema: z.literal("https://opencode.ai/config.json"),
    model: z.string().trim().min(1),
    mcp: z.record(z.string().min(1), z.object({ enabled: z.boolean() }).strict()).default({}),
    permission: z
      .record(z.string().min(1), z.union([permissionActionSchema, permissionRuleSchema]))
      .default({}),
  })
  .strict();
```

The `mcp` section only accepts `{ enabled: boolean }` — no transport or auth fields. The `permission` section accepts `"allow" | "ask" | "deny"` values keyed by tool name patterns.

## MCP Tool Naming Convention

When OpenCode loads tools from an MCP server, it names them using the pattern:

```
<servername>_<toolname>
```

For example, an MCP server named `"github"` exposing tools `create_issue` and `delete_repo` produces:

- `github_create_issue`
- `github_delete_repo`

This naming convention is what makes wildcard permission patterns work.

## Configuration Cases

### Case 1: MCP Server Disabled Entirely

The specialist cannot use any tools from this server. OpenCode will not even connect to the server for this workspace.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "github": { "enabled": false },
    "composio": { "enabled": false },
    "playwright": { "enabled": false },
    "context7": { "enabled": false },
  },
  "permission": {
    "github_*": "deny",
    "composio_*": "deny",
    "playwright_*": "deny",
    "context7_*": "deny",
  },
}
```

The `enabled: false` in `mcp` prevents the server from connecting. The `"deny"` permission is a defense-in-depth rule — even if the server somehow connects, the tools are denied.

> **Convention:** Every globally-defined MCP server must appear explicitly in the workspace `mcp` section. This makes the specialist's access surface auditable at a glance.

### Case 2: MCP Server Fully Enabled

The specialist can use all tools from the server without confirmation prompts.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "github": { "enabled": true },
    "composio": { "enabled": true },
    "playwright": { "enabled": false },
    "context7": { "enabled": true },
  },
  "permission": {
    "github_*": "allow",
    "composio_*": "allow",
    "playwright_*": "deny",
    "context7_*": "allow",
  },
}
```

The `"allow"` permission means the LLM can invoke any tool from the server without user confirmation. Use `"ask"` instead of `"allow"` to require user approval on each invocation.

### Case 3: Selective Tool Access from an MCP Server

The specialist can use some tools from the server but not others. Permission rules are evaluated in order — the last matching rule wins.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "github": { "enabled": true },
    "composio": { "enabled": true },
    "playwright": { "enabled": true },
    "context7": { "enabled": true },
  },
  "permission": {
    "github_*": "deny",
    "github_list_issues": "allow",
    "github_get_issue": "allow",
    "github_create_issue": "ask",
    "composio_*": "deny",
    "composio_SLACK_SEND_MESSAGE": "ask",
    "composio_SLACK_LIST_CHANNELS": "allow",
    "playwright_*": "deny",
    "playwright_browser_snapshot": "allow",
    "playwright_browser_navigate": "ask",
    "context7_*": "allow",
  },
}
```

In this example:

- **github**: Only read operations are allowed freely. Creating issues requires confirmation. All other tools (delete, merge, etc.) are denied.
- **composio**: All Composio tools are denied by default. Only two Slack-related tools are accessible — listing channels freely and sending messages with user confirmation.
- **playwright**: Only snapshot (read) is free. Navigation requires confirmation. All other browser actions are denied.
- **context7**: All tools are allowed without restriction.

## How CC Backend Renders Workspace Config

The `renderOpenCodeWorkspace` function in `workspace-contract.ts` converts the specialist's `capabilities` object into a valid `opencode.jsonc`. The Specialist schema provides two fields for control:

```ts
// Specialist capability selection (from schemas/specialists.ts)
capabilities: {
  mcpServers: [
    { name: "github", enabled: true, action: "allow" },    // server-level toggle + default action
    { name: "composio", enabled: true, action: "deny" },
  ],
  toolPermissions: [
    { pattern: "composio_SLACK_SEND_MESSAGE", action: "ask" },  // per-tool override
    { pattern: "composio_SLACK_LIST_CHANNELS", action: "allow" },
  ],
}
```

This renders to:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "mcp": {
    "github": { "enabled": true },
    "composio": { "enabled": true },
  },
  "permission": {
    "composio_SLACK_SEND_MESSAGE": "ask",
    "composio_SLACK_LIST_CHANNELS": "allow",
    "github_*": "allow",
    "composio_*": "deny",
  },
}
```

The rendering logic:

1. Each `mcpServers` entry produces an `mcp.<name>.enabled` toggle and a `permission.<name>_*` default action.
2. Each `toolPermissions` entry produces a `permission.<pattern>` override that takes precedence over the wildcard when the permission system matches last-wins.

## Integration with Composio

Composio-provided MCP servers follow the same model:

1. **Global auth** — CC connects to Composio globally using API keys or OAuth (managed via provider connections, same as existing provider connection flow).
2. **Composio MCP definition** — Registered in the global `opencode.jsonc` or `mcp_servers` DB table with the Composio MCP endpoint and credentials. Integrations → Composio accepts one connection per Composio account; each is a separate MCP server with its own name, API key secret, and `<name>_*` tool prefix.
3. **Per-specialist tool selection** — The Specialist editor lists available Composio tools (discovered via the MCP `tools/list` call) and the user selects which tools this specialist can use. The backend writes the appropriate `permission` rules to the workspace `opencode.jsonc`.

The Specialist editor UI should:

- Show all globally-registered MCP servers with a toggle (enabled/disabled) per specialist
- For enabled servers, list the available tools with per-tool permission control (allow / ask / deny)
- Default to `"deny"` for all tools of a newly-enabled server, requiring explicit opt-in

## Permission Actions Reference

| Action    | Behavior                                                              |
| --------- | --------------------------------------------------------------------- |
| `"allow"` | Tool executes without user confirmation                               |
| `"ask"`   | User is prompted to approve each invocation                           |
| `"deny"`  | Tool is removed from the LLM's available tools — it cannot be invoked |

## Key Source Files

| File                                                    | Purpose                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `opencode.jsonc` (root)                                 | Global MCP server definitions with auth                        |
| `packages/backend/src/opencode/workspace-contract.ts`   | Workspace schema, rendering, and validation                    |
| `packages/shared/src/schemas/specialists.ts`            | Specialist capability schema (`mcpServers`, `toolPermissions`) |
| `packages/backend/src/services/specialist-workspace.ts` | Writes workspace files on specialist create/update             |
| `examples/opencode/.../src/config/config.ts`            | OpenCode engine config schema (full `Mcp` union type)          |
| `examples/opencode/.../src/mcp/index.ts`                | MCP connection logic, `enabled` check, tool naming             |
| `examples/opencode/.../src/permission/index.ts`         | Permission evaluation, `disabled()` filter, wildcard matching  |
