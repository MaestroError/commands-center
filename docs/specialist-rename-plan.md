# Plan: Rename CC Agents to Specialists

## Goal

Rename the CommandsCenter product concept currently called an "agent" to
"specialist" so CC terminology does not conflict with OpenCode, AI agent
frameworks, or user projects that create and manage their own agents.

This plan covers CC-owned product language, APIs, MCP tools, portable workspace
structure, and domain code names. It intentionally preserves external protocol
names, OpenCode-native conventions, and internal SQLite storage identifiers that
do not leak into product surfaces.

## Preserve

- `AGENTS.md` as the OpenCode rules filename.
- Direct references to OpenCode `AGENTS.md` conventions.
- OpenCode SDK terms such as `AgentPartInput`.
- Generic external AI-agent wording when it clearly refers to user projects or
  third-party agent frameworks.
- Dependency and package names such as `agent-base`.

## Rename

- Product noun: `Agent` / `agent` to `Specialist` / `specialist`.
- UI routes: `/agents` to `/specialists`.
- API routes: `/api/agents` to `/api/specialists`.
- Public API route: `/api/public/v1/agents` to `/api/public/v1/specialists`.
- MCP server: `cc_agent_management` to `cc_specialist_management`.
- MCP route segment: `cc-agent-management` to `cc-specialist-management`.
- MCP tools:
  - `list_agents` to `list_specialists`
  - `create_agent` to `create_specialist`
  - `update_agent` to `update_specialist`
  - `draft_agent` to `draft_specialist`
  - `draft_agent_update` to `draft_specialist_update`
  - `remove_agent` to `remove_specialist`
  - `copy_custom_tool_to_agent` to `copy_custom_tool_to_specialist`
- Portable workspace path: `workspace/agents` to `workspace/specialists`.
- Portable metadata file: `agent.json` to `specialist.json`.
- API, shared schema, and domain fields where they represent CC specialists:
  - `defaultAgentId` to `defaultSpecialistId`
  - `mentionedAgentIds` to `mentionedSpecialistIds`
  - related task, run, conversation, custom-tool, and live-request fields.
- TypeScript domain/service names where developers work with the CC product
  concept.

## Implementation Sequence

1. Add workspace filesystem migrations first.
   - The workspace filesystem is the source of truth.
   - The specialist rename changes portable paths and metadata filenames, so the
     runtime needs a one-time workspace migration mechanism before the rename.
   - The rename migration must include both `up()` and `down()` so
     `ccenter filesystem-rollback` can manually revert the latest applied
     filesystem migration while the service is stopped.

2. Rename shared schemas and types.
   - Move agent schemas/types to specialist equivalents.
   - Update task, public API, custom-tool, conversation, and chat schemas that
     reference specialist ownership or specialist mentions.

3. Rename backend domain and workspace services.
   - Rename backend service modules, runtime config accessors, workspace
     reconciliation logic, and domain-facing TypeScript names from agent to
     specialist.
   - Keep physical SQLite table and column names such as `agents` and
     `agent_id` unchanged because SQLite is an internal runtime cache and those
     names are not user-facing.
   - Add a short comment near the Drizzle schema boundary explaining that the
     product term is specialist while the internal SQLite storage name remains
     agent.
   - Do not generate a Drizzle migration for this step unless a user-facing or
     portable workspace contract requires it.
   - Reuse the existing workspace filesystem migration for `agents/` to
     `specialists/` and `agent.json` to `specialist.json`; only adjust it if the
     implementation needs a missing case.

4. Rename backend routes and MCP surfaces.
   - Replace `/api/agents` route handlers with `/api/specialists`.
   - Rename nested conversation, workspace, custom-tool, and event routes.
   - Rename CC-managed MCP server names, route segments, tool names,
     descriptions, catalog entries, auth scopes, and tests.

5. Rename frontend product surfaces.
   - Rename pages, components, hooks, libs, route labels, copy, localStorage
     keys, query keys, test IDs, task prompt mentions, chat route params, and
     file-manager root labels.

6. Rename docs and package copy.
   - Update README, GOAL, planning docs, CLI package description, public API docs,
     and UI docs snippets.
   - Keep `AGENTS.md` references only where they refer to the OpenCode file or
     this repo's instruction document.

7. Verify.
   - Run `pnpm eslint --fix`.
   - Run `pnpm typecheck`.
   - Run `pnpm test`.
   - Run `pnpm test:e2e`.

## Notes

No backwards-compatible API aliases are required because CommandsCenter currently
has one user. The runtime may still preserve existing local workspace data by
moving it forward through filesystem migrations rather than exposing old names.
