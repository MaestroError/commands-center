# E5 OpenCode Workspace Contract

## Context

An agent is an OpenCode workspace — a directory containing `AGENTS.md` (system prompt), `opencode.jsonc` (model, MCP/tool permissions), and `.opencode/skills/` (copied skill files). The app creates and updates these files; OpenCode reads them at runtime. Refer to OpenCode documentation for workspace configuration format and supported fields.

C2 already generates workspace files, but the generation was built from assumptions rather than validated against OpenCode's actual workspace contract. This epic aligns the generated files with OpenCode documentation and adds validation to prevent drift.

## Outcome

Agent workspace files are generated according to the documented OpenCode workspace contract, validated at write time, and tested against OpenCode's expected configuration format.

## Why this is a separate PR

E2 and C2 are shipped. This epic hardens the workspace file generation by grounding it in OpenCode documentation rather than retrofitting completed epics.

## Blockers

- ✅ E2 OpenCode Orchestrator
- ✅ C2 Agent Workspace Lifecycle

## Unblocks

- No hard blockers. Improves correctness of agent workspace generation for all downstream epics.

## Scope

check `examples/opencode/packages/docs` for documentation, check `examples/opencode/.opencode/` for example and following links for more context:
- https://opencode.ai/docs/mcp-servers/
- https://opencode.ai/docs/skills/
- https://opencode.ai/docs/models/

- Audit generated `opencode.jsonc` fields against OpenCode documentation and align any deviations
- Audit generated `AGENTS.md` format against OpenCode's expected agent file conventions
- Audit skill copy target path (currently `skills/`, confirm against OpenCode's expected `.opencode/skills/` or equivalent)
- Add workspace file validation at write time to catch invalid config before OpenCode rejects it
- Document the workspace directory structure contract in code (what each file is, what OpenCode expects, where to find the upstream docs)
- Add tests that verify generated workspace files parse correctly under OpenCode's expected schema

## Acceptance Criteria

- Generated `opencode.jsonc` matches OpenCode's documented workspace config schema
- Generated `AGENTS.md` follows OpenCode's documented agent file conventions
- Skills are copied to the correct path that OpenCode loads from
- Workspace file generation includes validation that fails fast on invalid config
- The workspace directory structure contract is documented in code with references to OpenCode documentation
- Tests verify generated files conform to OpenCode's expected format

## Non-Goals

- Changing agent CRUD service logic (C2 scope)
- Changing orchestrator process management (E2 scope)
- Building UI screens
