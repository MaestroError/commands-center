# Chat Tools Tab

## Goal

Add a read-only `Tools` tab to the chat page right context panel after `Uploads`. The tab should show what tools the current specialist can use, with descriptions where CommandsCenter has reliable metadata.

## Scope

- Add the tab to `WorkspaceChatPage` after the existing `Uploads` tab.
- Show tools for the current chat specialist only.
- Show configured tool availability, not tool usage history.
- Use existing specialist capabilities and catalog data wherever possible.
- Do not attempt live introspection of third-party MCP servers from the chat tab.
- Make unavailable descriptions explicit instead of guessing.

## Current Observations

- `WorkspaceChatPage` renders the right context pane through `WorkspaceLayout`.
- The context pane currently has `Files` and `Uploads` tabs.
- `useConversation` already exposes the current specialist, including `capabilities`.
- `useSpecialistCatalogQuery` already returns:
  - built-in and workspace skills,
  - global MCP server names,
  - CC-managed MCP groups with tool names/descriptions/context for non-system-managed groups,
  - global custom tool names/descriptions.
- `useCustomToolsQuery` lists global custom tools.
- `useSpecialistCustomToolsQuery(agentId)` lists specialist-local custom tool copies with names/descriptions.
- External MCP servers can expose discovered tool names through `useMcpServersQuery`, but no descriptions are stored.
- CC-managed system groups such as `cc_default` and `cc_default_interactive` are real specialist tools, but the current catalog omits them because they are not editor-configurable.

## Tool Sources To Display

- [x] CC-managed tools.
  - Source: specialist capabilities plus CC-managed catalog metadata.
  - Include tool name, description, context badge (`Chat`, `Task run`, `Both`), and permission action where available.
  - Include enabled-by-default CC-managed system tools in the read-only tab so the operator can see the default tools given by CommandsCenter.

- [x] Custom tools.
  - Source: selected global custom tools from `agent.capabilities.customTools` plus specialist-local custom tool copies from `useSpecialistCustomToolsQuery(agentId)`.
  - Include name, slug, description, and managed/local status.
  - Show disabled/global-missing states when a selected global tool no longer resolves cleanly.

- [x] External MCP servers and discovered tool names.
  - Source: `agent.capabilities.mcpServers`, `agent.capabilities.toolPermissions`, and `useMcpServersQuery`.
  - Show server name, global runtime status, specialist permission action, and explicit permission patterns.
  - If runtime-discovered tool names are available, list names with no description.
  - If no tool names are available, show the server and explain that third-party tool descriptions are not available from stored configuration.

## Implementation Plan

- [x] Add shared tool-summary derivation.
  - Create a small frontend utility that accepts the specialist, specialist catalog, global MCP servers, global custom tools, and specialist-local custom tools.
  - Return grouped display data for CC-managed tools, custom tools, and external MCP tools.
  - Keep the helper pure so it can be tested without rendering.

- [x] Expose system-managed CC tool metadata for read-only display.
  - Prefer adding a read-only catalog projection that includes CC-managed system groups.
  - Keep the specialist editor catalog behavior unchanged if it relies on hiding system-managed groups.
  - Preserve tool context and descriptions from the existing CC-managed registry metadata.

- [x] Build the `ToolsTab` component.
  - Use theme-based classes and compact, scannable rows.
  - Group by source: `CommandsCenter`, `Custom tools`, `External MCP`.
  - Add badges for action (`Allow`, `Ask`, `Deny`) and context (`Chat`, `Task run`, `Both`).
  - Add search/filter if the combined list is large enough to need it.
  - Add empty states for specialists with no configured non-default tools.

- [x] Wire the tab into `WorkspaceChatPage`.
  - Add `Tools` after `Uploads` in the right context pane.
  - Fetch `useMcpServersQuery` and `useSpecialistCustomToolsQuery(conv.agent?.id)` only where needed.
  - Reset the active tab to `Files` on conversation changes, matching the current behavior.

- [x] Handle loading and error states.
  - Show partial data when one source fails and another succeeds.
  - Surface external MCP runtime failures next to the affected server.
  - Avoid blocking the whole tab because third-party MCP discovery failed.

- [x] Add tests.
  - Unit tests for the tool-summary derivation helper.
  - Component tests for `ToolsTab` groups, empty states, and unavailable descriptions.
  - `WorkspaceChatPage` test confirming the `Tools` tab renders after `Uploads`.
  - Regression test that third-party MCP entries can render with tool names but no descriptions.

- [x] Verify.
  - Run `pnpm format:fix`.
  - Run `pnpm lint`.
  - Run focused frontend tests for the new helper, `ToolsTab`, and `WorkspaceChatPage`.
