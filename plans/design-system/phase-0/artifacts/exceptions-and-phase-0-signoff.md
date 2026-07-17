# Exceptions and Phase 0 Sign-off

Execution record for [DS-0007](../07-exceptions-and-phase-0-signoff.md).

## Approved exception register

| ID     | Exact scope                                                                | Decision and rationale                                                                                                        | Theme behavior/owner                                                                                                   | Verification/reconsideration                                                                   |
| ------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| EX-001 | `components/common/AppLogo.tsx` product mark SVG                           | Retain as product identity; Lucide does not replace brand artwork                                                             | Fill continues to consume CC semantic variables                                                                        | Logo component tests and light/dark application baselines; reconsider only with a brand change |
| EX-002 | `pages/integrations/integration-icons.tsx` and provider-owned logos/colors | Retain exact provider identity where required; generic surrounding UI is not exempt                                           | Brand artwork may remain fixed; container/focus/status styling uses CC tokens                                          | Per-provider visual review in Phase 4                                                          |
| EX-003 | SVG string passed by `MilkdownDocumentEditor` to Crepe's menu API          | Retain string format because Crepe requires markup rather than a React component; artwork follows the Lucide folder/file form | `currentColor` inside the scoped editor bridge                                                                         | MILK-03 slash-menu baseline; reconsider when Crepe accepts React/icon nodes                    |
| EX-004 | xterm ANSI 16-color palette in `TerminalInstance.tsx`                      | Retain a controlled ANSI semantic palette so terminal output meaning remains stable                                           | ANSI roles may be theme-supplied; terminal base background/foreground/cursor/selection are not exempt and must migrate | Phase 5 terminal harness and color-mode screenshots                                            |
| EX-005 | Monaco/Milkdown code syntax-highlight token colors                         | Specialized syntax roles may remain a bounded palette rather than application status tokens                                   | Scoped third-party bridge owned by Phase 5                                                                             | Stable code fixture in each resolved mode; reconsider with editor-theme implementation         |
| EX-006 | Character entities/glyphs in `TodoDock`                                    | Closed as text glyphs, not hardcoded colors or inline icon artwork                                                            | Inherits text color                                                                                                    | Existing TodoDock tests                                                                        |

## Findings assigned to migration, not exceptions

| Scope                                             | Decision                                                                          | Phase                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Raw warning/success/danger palette utilities      | Replace with complete semantic roles                                              | Phase 1 for compatibility classes; Phase 4 for domain call sites |
| Category/mention colors                           | Define bounded identity/category roles only where product meaning is demonstrated | Phase 4                                                          |
| `Switch` emerald/white values                     | Migrate to semantic switch tokens and the approved CC primitive                   | Phase 2                                                          |
| `cc-panel` fixed shadow                           | Move to the bounded surface appearance contract if the current result is retained | Phase 1                                                          |
| Markdown copy glyph and equivalent UI inline SVGs | Replace with Lucide where a matching glyph exists without changing behavior       | Phase 4                                                          |
| Monaco `vs-dark`                                  | Implement resolved-mode bridge                                                    | Phase 5                                                          |
| xterm fixed base/cursor/selection colors          | Implement resolved-mode bridge; only ANSI palette has EX-004                      | Phase 5                                                          |
| File-manager raw palette utilities                | Migrate to semantic roles                                                         | Phases 4–5                                                       |
| Inactive assistant-ui/SVAR theming                | Closed for now because neither dependency nor consumer exists                     | Reopen with the feature that installs it                         |

No exception uses the generated project or teal theme as evidence.

## Approved contracts and manifests

- [Current-system inventory](current-system-inventory.md)
- [Target appearance contract](target-appearance-contract.md)
- [Component adoption matrix](component-adoption-matrix.md)
- [Application visual baseline manifest](application-visual-baseline-manifest.md)
- [Markdown and Milkdown baseline manifest](markdown-milkdown-baseline-manifest.md)
- [Semantic HTML impact inventory](semantic-html-impact-inventory.md)
- [Downstream phase reassessment](downstream-phase-reassessment.md)

## Phase 0 completion checklist

- [x] Every current theme/token/class/component family is inventoried with
      reproducible searches.
- [x] `Default`, color-mode preference/resolution, persistence, DOM, migration,
      flash-free initialization, and future theme registration are approved.
- [x] Every adoption-matrix row has one classification; no direct Radix
      exception is approved.
- [x] The first Phase 2 batch has exact files, dependencies, consumers, and
      behavioral prerequisites.
- [x] Current light/dark application visuals map to `Default + light/dark` at
      narrow and wide widths; modern is removal-only.
- [x] `.cc-md` and `.cc-md--chat` have reviewed deterministic baselines without
      style changes.
- [x] Milkdown has editable, read-only, serialization, selection, menu,
      code/image/table, light/dark, and narrow-width evidence.
- [x] All covered semantic elements have a current owner and Phase 1
      disposition, including zero-match tags.
- [x] Intended generic HTML changes and all protected/isolation boundaries are
      explicit.
- [x] Every possible hardcoded-style/icon/third-party exception is approved,
      assigned to migration, or explicitly closed.
- [x] Phases 1–6 are reassessed from Phase 0 evidence.
- [x] The generated design remains inspiration only.

## Known current-state issues, not blockers

- The existing 390px app header expands the document to 512px.
- The unclassed semantic fixture expands from 328px to 615px.
- The React Markdown renderer does not currently enable GFM tables despite
  table-specific code/styles.
- Development-mode Crepe initialization is timing-sensitive, so its visual
  baseline group runs serially.

These are observable starting conditions with assigned downstream handling.
They do not prevent the theme contract from being implemented.

## Verification record

| Check                        | Result                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Prettier                     | Pass; all Phase 0 plans, fixtures, specs, and manifests are formatted                                      |
| ESLint `--fix` and full lint | Pass across all workspaces                                                                                 |
| Type checking                | Pass across all four packages                                                                              |
| Unit/integration tests       | Pass across all four packages                                                                              |
| Design-system Playwright     | 16 pass on Chromium; mobile project intentionally skips because tests set explicit viewports               |
| Visual stability             | Two consecutive no-update runs pass; 25 reviewed screenshots                                               |
| Frontend production build    | Pass; the development baseline route and fixture strings are absent from emitted non-map assets            |
| Manual review                | Current wide/narrow application, generic HTML, Markdown, Milkdown, and light→dark token response inspected |

## Approval record and next gate

Phase 0 was authorized by the operator after review of the revised Phase 0 plan.
The evidence now supports technical sign-off with no unresolved architecture
blocker.

**Approved next action:** create the detailed Phase 1 task plan. Its first
implementation batch is the appearance state contract—types, resolver,
flash-free initialization, storage migration, `Default` selectors, header mode
control, Profile theme presentation, and modern removal. Semantic HTML rollout
starts only in later, separately reviewed Phase 1 tasks.
