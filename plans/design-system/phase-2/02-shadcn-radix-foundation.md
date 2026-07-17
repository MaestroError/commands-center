# DS-0202 — Initialize the Minimal Shadcn/Radix Boundary and `cn`

- Status: Complete (record: [shadcn-radix-foundation-record.md](artifacts/shadcn-radix-foundation-record.md); `radix-ui` install deferred to DS-0204)
- Phase: [Phase 2](README.md)
- Foundation reference:
  [React primitive ownership](../../design-system-foundation.md#react-primitives)
- Contract: [DS-0201 artifact](artifacts/batch-1-contract.md)

## Goal

Establish the smallest copy-owned Shadcn/Radix structure required by the first
batch, with a reviewed `cn` utility and enforceable import/dependency boundary.

## Context

CC uses Vite, React 19, strict TypeScript, Tailwind v4 CSS-native configuration,
and the `@/` alias. Shadcn is not initialized and Radix is not a direct
dependency. Initialization must fit this stack without adding a parallel
palette, Tailwind config, reset, global radius system, or runtime component
package.

## Scope

- Add the direct dependencies approved by DS-0201 at the frontend package level.
- Add `components.json` configured for the existing Vite/Tailwind v4 setup,
  `@/components` and `@/lib` aliases, TSX, and the Radix base.
- Add `src/lib/cn.ts` using only approved class-composition dependencies.
- Review generated or referenced CSS expectations and reject Shadcn palette,
  radius, typography, or base-style additions that duplicate CC's contract.
- Establish a repository check that allows `radix-ui` imports only from
  `src/components/ui/` unless the adoption matrix later records an exception.
- Confirm no generated barrel file or default export is introduced.

## Required deliverables

- Minimal `components.json` and `src/lib/cn.ts`.
- Frontend manifest and lockfile changes limited to approved direct
  dependencies and their transitive requirements.
- Focused `cn` behavior tests for conditional classes and Tailwind conflict
  resolution.
- `artifacts/shadcn-radix-foundation-record.md` recording reviewed generated
  choices, dependency versions, rejected defaults, and ownership checks.

## Blockers and dependencies

- Blocked by: DS-0201.
- Blocks: DS-0203, DS-0204, DS-0205, and DS-0207.

## Acceptance criteria

- [ ] Shadcn configuration explicitly targets the existing stack and Radix
      base; it does not create a second Tailwind configuration.
- [ ] Only approved direct dependencies are added to the frontend package.
- [ ] `cn` composes conditional classes and resolves conflicting Tailwind
      utilities predictably.
- [ ] No Shadcn palette variables, generic theme names, reset, font, animation
      package, or duplicate radius scale is added.
- [ ] Radix imports are restricted to `components/ui/`.
- [ ] Source files use named exports and existing alias/import conventions.
- [ ] No component branches on theme ID or resolved color mode.
- [ ] Existing production `cc-*` consumers remain untouched.

## Verification tests

- Unit-test `cn` with falsey inputs and conflicting semantic/layout utilities.
- Search dependency and source changes against the DS-0201 allowlist.
- Search for direct Radix imports outside `components/ui/`.
- Search for newly introduced generic Shadcn variables and raw palette classes.
- Run frontend lint, typecheck, unit tests, and production build.

## Out of scope

- Adding any UI primitive beyond the three approved files.
- Running a bulk Shadcn component import.
- Replacing current compatibility classes or production call sites.
