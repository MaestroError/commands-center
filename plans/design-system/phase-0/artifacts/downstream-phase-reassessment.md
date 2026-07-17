# Downstream Phase Reassessment

Execution record for [DS-0007](../07-exceptions-and-phase-0-signoff.md).

## Revised sequence

The high-level phase order remains valid, but Phase 0 evidence removes several
assumptions and adds explicit gates:

1. Phase 1 begins with the appearance state contract and token completeness,
   not semantic HTML styling.
2. Semantic HTML rolls out in four reviewable batches only after the
   `Default`/resolved-mode contract is stable.
3. Phase 2's first Shadcn/Radix batch is fixed to Button, Dialog, and
   AlertDialog with three concrete dialog consumers.
4. Phases 4 and 5 own hardcoded appearance cleanup and third-party bridges;
   they are not exceptions merely because they cannot migrate in Phase 1.
5. Phase 6 audits against Phase 0's reproducible counts and approved exception
   IDs.

## Evidence-to-phase map

| Phase 0 finding                                                        | Affected phase             | Revised work/blocker                                                                                                                        | Required verification                                                                                            |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Theme and color mode are currently one `ThemeName`                     | Phase 1                    | Implement types, resolver, pre-React bootstrap, store/context split, legacy migration, and UI ownership before other token consumers change | Six preference/OS combinations, live system changes, no wrong-mode flash, legacy light/dark/modern/invalid cases |
| Current 22 light/dark token roles are incomplete for semantic states   | Phase 1                    | Create complete `Default` color roles and bounded shape/emphasis roles; preserve current values/aliases first                               | Token completeness plus application/Markdown comparisons                                                         |
| Existing mobile header reaches 512px at a 390px viewport               | Phase 1                    | Add a focused shell responsiveness task; do not blame semantic base styles for this pre-existing overflow                                   | Application narrow baseline and explicit `scrollWidth <= clientWidth` assertion after reviewed fix               |
| Unclassed content reaches 615px inside a 328px content box             | Phase 1                    | Semantic rollout must include long-token/pre/table overflow in its final batch                                                              | Generic semantic screenshots/overflow assertions, `.cc-md` unchanged                                             |
| 600 direct semantic tags occur in 83 files                             | Phase 1                    | Roll out base rules in four batches and sample bare/partially styled/component-owned contexts each time                                     | Semantic impact inventory and affected screen snapshots per batch                                                |
| Markdown renderer has no rendered GFM table despite dormant styles     | Separate Markdown decision | Do not enable GFM during design-system work; table support requires its own explicit product task                                           | Existing MD-01 baseline remains source of truth                                                                  |
| Current dialogs lack a unified accessible behavior contract            | Phases 2–3                 | First Radix batch is Button/Dialog/AlertDialog; add focus, Escape, portal, and safe-action tests before consumer migration                  | Focus in/return, accessible title/description, overlay/Escape, callbacks and screenshots                         |
| Native selects/checks remain sufficient in many forms                  | Phases 2–4                 | Retain native controls unless the adoption matrix identifies custom behavior                                                                | Existing form/E2E coverage; no speculative Radix replacement                                                     |
| 179 raw palette matches across 25 files                                | Phase 4                    | Migrate by semantic role/domain; retain only registered branding/category/ANSI exceptions                                                   | Search count ratchet and light/dark domain review                                                                |
| 16 inline-SVG TSX files versus 52 Lucide-import files                  | Phase 4                    | Replace equivalent UI glyphs with Lucide; retain product/brand/third-party-format exceptions only                                           | Search ratchet plus exception IDs EX-001–EX-003                                                                  |
| Milkdown already uses scoped variables but lacked live editor coverage | Phase 5                    | Use MILK-01–04 before mapping Crepe variables; generic base rules must not leak                                                             | Serialization, read-only, slash command, selection, code/image/table, light/dark/narrow images                   |
| Monaco forces `vs-dark`                                                | Phase 5                    | Build a CC-resolved-mode Monaco bridge                                                                                                      | Stable document baseline and mode-switch assertion                                                               |
| xterm fixes base and ANSI colors                                       | Phase 5                    | Theme base/cursor/selection; retain controlled ANSI semantics                                                                               | Existing lifecycle harness plus light/dark terminal appearance tests                                             |
| SVAR and assistant-ui are not installed/currently active               | Future feature work        | Do not build speculative bridges in this design-system project                                                                              | Reassess only when a real dependency/consumer is introduced                                                      |
| Phase 0 adds 25 reviewed screenshots                                   | Phases 1–6                 | Treat them as migration inputs, not a permanent blanket snapshot suite                                                                      | Two no-update runs for every affected batch; update only for explained changes                                   |

## Detailed planning gates

### Phase 1

Create detailed tasks before editing foundation code. The first implementation
batch should contain only:

1. Appearance types and pure resolver/migration behavior.
2. Flash-free initialization and store/context integration.
3. `Default` light/dark selectors plus complete aliases for current consumers.
4. Header color-mode control and Default-only Profile presentation.
5. Removal of `modern` after the migration path is verified.

Semantic HTML batches and mobile-header correction should be separate Phase 1
tasks after that contract passes.

### Phase 2

Blocked by Phase 1 token/state stability. Batch 1 may add only:

- `components/ui/button.tsx`
- `components/ui/dialog.tsx`
- `components/ui/alert-dialog.tsx`
- `lib/cn.ts` if no equivalent exists
- Unified `radix-ui`, CVA, clsx, and tailwind-merge only as justified by those
  files

No other Shadcn file is approved by Phase 0.

### Phases 3–6

- Phase 3 begins with `ConfirmDialog`, `DocumentCreateDialog`, and
  `DocumentFolderDialog`, then re-evaluates other common compositions.
- Phase 4 creates small domain batches tied to raw-palette and inline-icon
  inventory rows; it must not mix business refactors with visual migration.
- Phase 5 creates one scoped bridge task per third-party surface and uses the
  corresponding behavioral harness.
- Phase 6 converts the reproduction commands and exception register into
  lightweight contributor guidance and audits after migration counts establish
  realistic ratchets.

## Closed assumptions

- The generated teal design does not define tokens, primitives, or exceptions.
- `system` is not a third palette and requires no third visual snapshot set.
- Shadcn is copy-owned implementation source; Radix imports stay inside
  `components/ui`.
- Generic HTML, Markdown, Milkdown, page layout, and third-party internals are
  outside Shadcn ownership.
- Future Profile-level theme configuration is workspace-portable; device color
  mode remains local.
