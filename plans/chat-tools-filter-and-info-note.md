# Chat tools filter and informational note plan

## Scope

Add a frontend-only filter to the Chat page Tools tab and explain that the panel is a read-only view of the tools CommandsCenter provides to the active AI specialist.

## Assumptions

- Filtering is case-insensitive and matches visible tool metadata such as tool names, slugs, descriptions, server names, and permission labels.
- Matching a server/group name keeps that server's tools visible; matching an individual nested tool shows only that tool inside its server card.
- No API, persistence, or portable workspace changes are required.

## Implementation tasks

- [x] Add focused component coverage for the informational note, local filtering, and the no-match state.
- [x] Add a theme-backed search field and filter CommandsCenter, custom, and external MCP tool summaries in the frontend.
- [x] Add the informational-only note using concise operator-facing copy.
- [x] Run ESLint with fixes, focused tests, typecheck, the full test suite, and task/chat E2E coverage as appropriate.

## Acceptance criteria

- The Tools tab says it is informational only and shows tools CommandsCenter provides to the AI specialist.
- Typing in the filter immediately narrows visible tools without making API requests.
- Nested tool groups retain only matching tools unless the group/server itself matches.
- An explicit empty result appears when no tool matches.
- Existing loading, error, and no-tools states continue to work.

## Constraints

- Reuse existing theme-backed classes and tokens.
- Do not add dependencies or persistence changes.
- Preserve unrelated uncommitted work.
- Do not commit.
