# Theme-Authoring Dry Run

Hypothetical ID: `example`. No files were changed to add it.

## Authorized future file set

1. `packages/frontend/src/lib/appearance.ts` (or a dedicated registry extracted
   from it): stable ID and display metadata only.
2. `packages/frontend/src/styles/globals.css`: complete `example` light/dark
   declarations plus shared shape/emphasis values.
3. Portable workspace configuration/schema and focused backend/frontend tests:
   selected theme and user-provided declarations/assets. This capability does
   not exist while `Default` is the only option and must precede selection UI.
4. Existing appearance, token-contract, gallery, Markdown/Milkdown, Monaco,
   xterm, responsive, and production-exclusion tests: new cases only.

No page, common composition, UI primitive, Markdown renderer, Milkdown editor,
Monaco editor, terminal lifecycle component, or file-manager implementation
needs appearance changes. `system` continues to resolve only color mode. Bridge
output and resolved mode remain derived and nonportable.

The dry run therefore validates the component-independence of theme values
while preserving the Phase 0 rule that a second selectable theme cannot ship
until its selection and any custom assets have a workspace-portable source of
truth.
