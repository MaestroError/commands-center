# C1 Database and Workspace Foundation

## Outcome

The project has a real MVP schema baseline, DB client setup, migrations, and portable workspace conventions.

## Why this is a separate PR

Every product feature persists through this layer. Once merged, later PRs can add behavior instead of inventing storage.

## Blockers

- E1 Runtime Bootstrap

## Unblocks

- C2 Agent Workspace Lifecycle
- C3 Direct Chat Session Model
- U4 File Manager and Terminals
- U5 Profile, Settings, and Theming

## Scope

- Implement DB client factory for SQLite now with architecture ready for PG dual-write later
- Use ULID as the primary key type for all tables to ensure collision-safe, lexicographically sortable IDs across distributed and portable environments
- Add schema and migrations for agents, conversations, messages, settings, providers, MCP servers, custom tools, automations, and automation runs
- Add repository or service helpers for common DB access patterns
- Define workspace directory layout inside `.cc/workspace/` as the single portable state directory: agents, database (`local.db`), preferences, auth credentials, MCP configs, automations, and all user data
- Ensure the DB file (`local.db`) lives inside `.cc/workspace/database/` so it is portable with the rest of the state
- Add test helpers for isolated DB-backed service tests

## Acceptance Criteria

- All tables use ULID primary keys, not auto-incrementing integers
- Migrations can create the Phase 1 baseline schema on a clean local workspace
- Backend services can access a typed DB client without ad hoc initialization
- Workspace layout under `.cc/workspace/` for agent folders, DB, preferences, auth, and MCP configs is documented in code and consistent
- Copying `.cc/workspace/` to another machine produces a fully functional state when running `ccenter start`
- Local tests can spin up isolated DB state without hand-written setup in each test

## Non-Goals

- Full PG dual-write implementation
- Agent creation side effects
- Chat execution
