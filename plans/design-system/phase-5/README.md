# Phase 5 — Complete Third-Party Theming

- Status: Planned

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-5--complete-third-party-theming)

Required evidence:

- [Current-system inventory](../phase-0/artifacts/current-system-inventory.md)
- [Markdown and Milkdown baseline manifest](../phase-0/artifacts/markdown-milkdown-baseline-manifest.md)
- [Exception register](../phase-0/artifacts/exceptions-and-phase-0-signoff.md)
- [Phase 4 task plan](../phase-4/README.md)
- Phase 4 sign-off and `artifacts/phase-5-handoff.md`, produced by DS-0412

## Goal

Make every real third-party visual surface consume the `Default` theme's
semantic light/dark contract and update live when the resolved color mode
changes, without leaking generic HTML rules into third-party internals or
changing editor, terminal, document, and file-manager behavior.

## Delivery strategy

1. Accept the actual Phase 4 handoff and freeze the live bridge inventory,
   semantic mappings, fixtures, exceptions, and file ownership.
2. Migrate one surface at a time: Milkdown, Monaco, xterm, then the file-manager
   bridge audit.
3. Capture or prove a stable fixture before changing each surface. Reuse the
   frozen Milkdown baselines; add Monaco and xterm fixtures before removing
   their fixed themes.
4. Keep adapters narrow: CC semantic tokens enter the third-party API or scoped
   stylesheet, while third-party implementation details do not become global
   design-system APIs.
5. Close with live `light`, `dark`, and `system` switching, residual audits,
   exception reconciliation, and an exact Phase 6 enforcement handoff.

Phase 5 is not a visual redesign. Syntax highlighting and the terminal ANSI
palette remain bounded, reviewed palettes under EX-004/EX-005; base surfaces,
text, cursor, selection, borders, focus, and overlays must follow CC semantics.

## Task sequence

| ID      | Task                                                                               | Blocked by              | Status  |
| ------- | ---------------------------------------------------------------------------------- | ----------------------- | ------- |
| DS-0501 | [Accept the Phase 4 handoff and freeze bridge contracts](01-phase-4-handoff.md)    | Phase 4 sign-off        | Planned |
| DS-0502 | [Migrate the Milkdown and Crepe theme bridge](02-milkdown-bridge.md)               | DS-0501                 | Planned |
| DS-0503 | [Migrate the Monaco theme bridge](03-monaco-bridge.md)                             | DS-0501                 | Planned |
| DS-0504 | [Migrate the xterm theme bridge](04-xterm-bridge.md)                               | DS-0501                 | Planned |
| DS-0505 | [Audit and normalize the file-manager bridge](05-file-manager-bridge.md)           | DS-0501, DS-0409        | Planned |
| DS-0506 | [Verify integrated live appearance switching](06-live-appearance-switching.md)     | DS-0502 through DS-0505 | Planned |
| DS-0507 | [Close bridge inventories and exception ownership](07-inventory-and-exceptions.md) | DS-0502 through DS-0506 | Planned |
| DS-0508 | [Verify and sign off Phase 5](08-phase-5-signoff.md)                               | DS-0501 through DS-0507 | Planned |

DS-0502, DS-0503, DS-0504, and DS-0505 may proceed in parallel after DS-0501
when their production and fixture file sets do not overlap. Within DS-0503 and
DS-0504, fixture capture is a hard internal gate before fixed theme values are
changed.

## Surface contracts

| Surface      | Existing behavior to remove or normalize             | Protected behavior                                  |
| ------------ | ---------------------------------------------------- | --------------------------------------------------- |
| Milkdown     | Scoped Crepe palette and editor-specific overrides   | Markdown data, editing, menus, selection, overflow  |
| Monaco       | Forced `theme="vs-dark"`                             | Model value, language, path, save, read-only state  |
| xterm        | Hardcoded base theme object and ANSI values          | Buffer, PTY/WebSocket, addons, selection, reconnect |
| File manager | Only a bridge proven by a real post-Phase-4 consumer | File operations, navigation, revisions, permissions |

## Protected and excluded boundaries

- `.cc-md` and `.cc-md--chat` remain frozen and are not part of this phase.
- Milkdown stays scoped beneath `.milkdown-editor-wrapper`; global base-element
  styles must remain excluded from its internals.
- Monaco and xterm receive values through their supported APIs, not global
  descendant selector trees.
- Do not install SVAR, assistant-ui, or another dependency to manufacture a
  bridge. An absent consumer is recorded as absent.
- Do not replace Crepe, Monaco, xterm, or file-manager behavior with Shadcn or
  Radix. These are third-party adapter tasks, not primitive migrations.
- Do not persist resolved color mode or bridge output as portable workspace
  configuration. The existing appearance preference remains the source.

## Phase exit gate

Phase 5 is complete only when:

- Milkdown, Monaco, xterm, and every proven file-manager bridge use documented
  CC semantic inputs for theme-dependent visual roles.
- `light`, `dark`, and `system` changes update mounted surfaces without reload,
  content loss, reconnection, editor recreation, or fixed-color islands.
- Milkdown's frozen data/editing behavior and generic-style isolation pass.
- Monaco and xterm have deterministic pre-change fixtures and focused behavior
  assertions in addition to visual review.
- EX-004 and EX-005 describe the final bounded ANSI/syntax palettes with exact
  ownership and verification.
- No speculative SVAR or assistant-ui adapter exists.
- Phase 6 receives enforceable searches, approved adapter APIs, fixture paths,
  and final exception dispositions.
