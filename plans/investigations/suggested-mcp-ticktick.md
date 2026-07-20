# Suggested MCP: TickTick — deferred (check for official server later)

**Status:** Not added. Revisit if/when TickTick ships an official remote MCP.

## Decision

Investigated adding TickTick to `SUGGESTED_MCP_SERVERS` in
`packages/frontend/src/pages/integrations/integration-helpers.ts`. Decided **not** to add it now.

## Why not (as of 2026-07-17)

- **No official server.** Every TickTick MCP is a community project. Nothing in
  Claude's connector registry (`search_mcp_registry` returned empty).
- **Setup friction breaks the suggested-list model.** TickTick's Open API is OAuth 2.0
  only (no simple API key). Each user must create their own TickTick OAuth developer app,
  set a localhost redirect URI, supply client id + secret, and complete an interactive
  browser auth. Our curated suggestions are meant to be no-auth or one-click OAuth.
- **Maturity.** The one npx-friendly package (`ticktick-mcp`, jordyvandomselaar, npm
  v0.2.2) is a solo-maintainer project. Fine to add manually via the "add MCP server"
  form, not worth endorsing in the curated list.

## When to revisit

Add it if TickTick publishes an **official remote MCP** (streamable-http + OAuth, like the
existing Notion/Linear/Sentry entries). That's the bar for inclusion.

## Ready-to-use entry (if the bar is met, or to add the community npm package manually)

```ts
{
  id: "ticktick",
  name: "TickTick",
  description: "Tasks, projects, and due dates in TickTick. Requires a TickTick OAuth app.",
  authBadge: "OAuth",
  tags: ["auth:oauth", "category:productivity", "language:node", "launcher:npx", "type:local", "source:community"],
  form: {
    ...EMPTY_FORM_BASE,
    name: "ticktick",
    transport: "stdio",
    authMethod: "none",
    commandText: "npx\n-y\nticktick-mcp",
    environmentText:
      "TICKTICK_CLIENT_ID={env:TICKTICK_CLIENT_ID}\nTICKTICK_CLIENT_SECRET={env:TICKTICK_CLIENT_SECRET}",
  },
},
```

## References

- npm `ticktick-mcp` (npx-launchable): https://github.com/jordyvandomselaar/ticktick-mcp
- jacepark12/ticktick-mcp (~297★, repo-clone + uv, doesn't fit our format): https://github.com/jacepark12/ticktick-mcp
