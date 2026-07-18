# Phase 6 Sign-Off

Date: 2026-07-18

## Task acceptance

DS-0601 through DS-0608 are complete. Their live contracts, artifacts, docs,
gallery fixtures, audit rules, compatibility disposition, and workflow wiring
agree with the post-Phase-5 repository. DS-0609 closes the phase with the
verification evidence below.

## Contributor exercise

Starting only from `AGENTS.md`, `CONTRIBUTING.md`, and `docs/design-system/`, a
contributor reaches these approved choices:

| Scenario                         | Selected layer / verification                                    |
| -------------------------------- | ---------------------------------------------------------------- |
| Layout and spacing               | Tailwind utilities                                               |
| Theme-dependent color or shape   | semantic CC token exposed through Tailwind                       |
| Unclassed `h1`, `p`, `ul`, table | semantic HTML under the global CC base layer                     |
| Chat or reader Markdown          | protected `.cc-md--chat` / `.cc-md` scope                        |
| Milkdown document                | scoped `.milkdown-editor-wrapper` adapter                        |
| Form action                      | native control or CC-owned `Button`/`Input`                      |
| Dialog or menu behavior          | CC-owned primitive/common composition, never direct domain Radix |
| Domain-specific interaction      | audit existing domain UI before extraction                       |
| Monaco or xterm                  | approved bridge supplied with resolved color mode                |
| Icon                             | Lucide unless a registered inline-SVG exception applies          |
| New theme                        | declaration/registration/portable-state workflow in `themes.md`  |
| Visual exception                 | evidence-backed `EX-NNN` workflow in `exceptions.md`             |

DS007 verifies canonical documentation links and DS008 verifies documented
frontend example imports against live modules.

## Theme and portability review

The hypothetical-theme dry run changes appearance declarations, registration,
portable configuration, and tests only; it requires no component appearance
edit. Theme identity remains `Default`, while light/dark/system remains a local
color-mode preference. Resolved mode and bridge output remain derived state, so
Phase 6 adds no nonportable workspace state.

## Final compatibility and exception state

- `.cc-nav-item` and `cc-button-primary` are retired and rejected by DS004.
- Every retained compatibility class has an exact maximum and owner in the
  compatibility artifacts; counts cannot grow.
- EX-001 through EX-005 have exact paths and owners. DS001, DS002, DS005, and
  DS006 reject unapproved paths, palette roles, bridge bypasses, and count drift.
- Chat Markdown, reader Markdown, Milkdown, Monaco, xterm, unclassed semantic
  HTML, focus, keyboard, and responsive contracts remain covered.

## Gallery and production boundary

The development gallery uses final public APIs and deterministic fixture data.
Two consecutive Chromium design-system runs passed 44 of 44 tests. The full E2E
run passed 150 tests with 44 intentional mobile-project skips. Production builds
contain no executable gallery route, marker, fixture module, or asset; source
maps retain original source text according to the repository's existing debug
policy but expose no runnable route.

## Verification results

| Command / review                                                    | Result                                   |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm format`                                                       | Passed                                   |
| `pnpm lint`                                                         | Passed                                   |
| `pnpm lint:root`                                                    | Passed                                   |
| `pnpm typecheck`                                                    | Passed                                   |
| `pnpm test`                                                         | Passed across all package suites         |
| `pnpm knip`                                                         | Passed                                   |
| `pnpm build`                                                        | Passed; existing chunk warnings only     |
| `pnpm test:e2e`                                                     | 150 passed, 44 intentionally skipped     |
| `pnpm design-system:audit`                                          | Passed baseline and all 15 focused tests |
| `pnpm release:check`                                                | Passed                                   |
| Design-system Chromium pass 1                                       | 44 passed                                |
| Design-system Chromium pass 2                                       | 44 passed                                |
| Executable production marker and retired-compatibility searches     | Passed                                   |
| Theme dry run, exception ownership, docs links/imports, portability | Passed                                   |

The repository audit completes in approximately 0.25 seconds, uses only the
Node standard library, and runs identically through the local package command,
CI static checks, and release gate. No screenshot baselines are committed.

## Remaining issues

No Phase 6 blocker remains. Build output continues to report the repository's
pre-existing large-chunk warnings; bundle strategy is outside this phase.
