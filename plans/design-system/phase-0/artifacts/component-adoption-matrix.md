# Component Disposition and Shadcn/Radix Adoption Matrix

- Task: [DS-0003](../03-component-disposition-and-adoption-matrix.md)
- Current inventory: [DS-0001 artifact](current-system-inventory.md)
- Appearance contract: [DS-0002 artifact](target-appearance-contract.md)
- Status: Approved

## Classification vocabulary

- **Keep native**: browser semantics are sufficient; CC applies semantic
  Tailwind/classes without replacing the control.
- **Keep domain-specific**: behavior belongs to a feature and must not be hidden
  in a generic primitive.
- **Normalize existing**: preserve the implementation but move raw appearance
  values to the CC contract.
- **Wrap existing**: expose a typed `components/ui` primitive over the current
  visual contract.
- **Migrate to Shadcn/Radix**: copy Shadcn source configured with the Radix base,
  then adapt it to CC APIs and tokens.
- **Retire**: remove only after consumers migrate and tests prove it is unused.

## Ownership and import boundary

1. Application pages, `components/common`, and domain components import
   primitives from `@/components/ui/*`.
2. Only `components/ui/` imports `radix-ui` by default.
3. A direct Radix import elsewhere requires an exception row below; none is
   approved in Phase 0.
4. Shadcn source is copied into CC and reviewed. It is not treated as an opaque
   component package.
5. Shadcn must be initialized with the Radix base explicitly.
6. Generated palette/radius variables are replaced by the approved CC semantic
   appearance contract.
7. No component branches on `default`, `light`, or `dark` to select classes.

Current boundary check: there are no Radix imports and no Shadcn component
structure in the frontend.

## Adoption matrix

| ID     | Pattern and current locations                                                                                   | Required behavior                                                                     | Existing contract/tests                                                                       | Classification and target                                                                                                                      | Radix                                                 | Planned batch / risk                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| UI-001 | Buttons across pages and domains using `cc-button*`                                                             | Native activation, disabled state, variants, icon labels                              | Broad page tests; compatibility classes are heavily used                                      | Wrap existing as `components/ui/Button` and `IconButton`; preserve `cc-button*` during migration; Shadcn Button source may seed types/variants | No                                                    | Phase 2 batch 1; low behavior risk, high visual reach           |
| UI-002 | Text inputs/textareas using `cc-input`; `PasswordInput`                                                         | Native label/form/autocomplete, error/disabled/focus states                           | `PasswordInput.test.tsx` and form tests                                                       | Wrap native elements as `Input`/`Textarea`; keep `PasswordInput` as common composition                                                         | No                                                    | Phase 2 batch 2; avoid changing form behavior                   |
| UI-003 | Simple native `<select>` controls in forms                                                                      | Native keyboard, mobile picker, form submission                                       | Many page tests                                                                               | Keep native; optional typed `SelectField` wrapper may preserve `cc-input` without Radix                                                        | No                                                    | Phase 3/4; do not replace merely for styling                    |
| UI-004 | `SearchableSelect`, `ModelSelector`                                                                             | Combobox semantics, filtering, active descendant, Escape/Enter, outside interaction   | Focused common/model tests                                                                    | Migrate common combobox composition to Shadcn Popover + Command; keep ModelSelector domain data/API outside primitive                          | Yes for Popover; Command uses its approved dependency | Phase 3 after first primitives; medium focus risk               |
| UI-005 | `cc-panel` surfaces, page cards                                                                                 | Layout-neutral border/background/radius/elevation                                     | Broad page tests                                                                              | Wrap as `Surface`/`Card`; preserve `cc-panel` compatibility                                                                                    | No                                                    | Phase 2 batch 2; visual-only                                    |
| UI-006 | `cc-badge*`, task/status helpers, mention/category chips                                                        | Semantic role, label, optional icon, compact variants                                 | Mixed page/component tests                                                                    | Create `Badge` and `Status`; normalize role colors to DS-0002 tokens; category colors remain exception candidates                              | No                                                    | Phase 2 batch 2; token dependency                               |
| UI-007 | `cc-alert`, `cc-success`, inline warning/error/success blocks                                                   | Semantic status, accessible label/live behavior where needed                          | Page tests                                                                                    | Create `Alert` with info/success/warning/danger variants; preserve compatibility classes during migration                                      | No                                                    | Phase 2 batch 2; token dependency                               |
| UI-008 | `ConfirmDialog` and destructive inline dialogs in API/settings/custom tools                                     | Modal focus trap/return, Escape, outside behavior, safe destructive focus, portal     | `ConfirmDialog.test.tsx` plus domain tests; current common dialog lacks full focus management | Migrate common contract to Shadcn AlertDialog backed by Radix; domain code composes it                                                         | Yes, AlertDialog                                      | Phase 2 batch 1; high accessibility value                       |
| UI-009 | Ordinary dialogs: document create/folder, integrations, task context, chat prompts/history, file-manager shells | Modal focus, title/description, portal, Escape, focus return, responsive shell        | Multiple focused tests with inconsistent implementations                                      | Add Shadcn Dialog backed by Radix; common/domain components keep their APIs and compose it                                                     | Yes, Dialog                                           | Phase 2 batch 1 then Phase 3/4 consumers; medium migration risk |
| UI-010 | `ImageLightbox`                                                                                                 | Modal image viewing, Escape, click dismissal, image sizing                            | Chat tests                                                                                    | Keep domain composition but use CC Dialog shell after behavior comparison                                                                      | Yes internally through CC Dialog                      | Phase 4; visual/gesture review required                         |
| UI-011 | `WorkspaceFilePickerDialog`, `QuickFileModal`, global search palette                                            | Search, selection, modal focus, domain navigation                                     | Focused picker/quick-file tests; global search tests                                          | Keep domain logic; compose CC Dialog and later common combobox/list primitives                                                                 | Yes only through approved CC primitives               | Phase 3/4; audit focus and shortcuts                            |
| UI-012 | `ThemeMenu` and ordinary action menus                                                                           | Menu radio selection, arrows/typeahead, Escape, outside interaction, focus return     | `ThemeMenu.test.tsx`; current implementation only handles Escape/outside click                | Migrate shell to CC DropdownMenu/RadioGroup from Shadcn/Radix; Phase 1 may temporarily retain current menu while appearance state changes      | Yes, DropdownMenu                                     | Phase 2 batch 2 / Phase 3 consumer                              |
| UI-013 | Tooltips/title-only icon controls                                                                               | Accessible description, delay, portal/collision                                       | No unified coverage                                                                           | Add CC Tooltip only for concrete icon-control migrations                                                                                       | Yes, Tooltip                                          | Phase 2 batch 2; no speculative bulk replacement                |
| UI-014 | `Switch`                                                                                                        | Switch semantics, keyboard activation, focus, checked/disabled states                 | No focused common test; current colors bypass tokens                                          | Migrate to Shadcn/Radix Switch and DS-0002 tokens                                                                                              | Yes, Switch                                           | Phase 2 batch 2; add focused tests first                        |
| UI-015 | Native checkboxes/radios in forms                                                                               | Native keyboard/form semantics                                                        | Broad page tests                                                                              | Keep native by default and theme through base/utility styles                                                                                   | No                                                    | Phase 1/4                                                       |
| UI-016 | API tri-state checkbox and visually custom checks                                                               | Checked/unchecked/indeterminate, form labeling                                        | API page tests                                                                                | Migrate only the reusable tri-state visual control to CC Checkbox backed by Radix; retain domain permission logic                              | Yes, Checkbox                                         | Phase 3/4; test indeterminate state                             |
| UI-017 | `TabBar`, system-prompt tabs                                                                                    | Tab semantics, arrows, active panel relationship                                      | `TabBar.test.tsx`, system prompt tests                                                        | Migrate ordinary reusable tabs to Shadcn/Radix Tabs                                                                                            | Yes, Tabs                                             | Phase 2 batch 2 / Phase 3                                       |
| UI-018 | Terminal/editor/inspector tab bars                                                                              | Selection, close, dirty state, drag/reorder or pane ownership                         | Focused terminal/editor/layout tests                                                          | Keep domain-specific controllers and tab items; may reuse visual Button/Tooltip, not generic Radix Tabs                                        | No direct Radix                                       | Phase 4; high behavior risk                                     |
| UI-019 | Composer file/slash/specialist suggestion popovers                                                              | Keep textarea focus, intercept arrows/Enter/Escape, insert at cursor, async filtering | File mention and composer/task tests                                                          | Keep domain-specific. Do not use modal/focus-moving Radix Popover; normalize shared list visual roles only after behavior tests                | No                                                    | Phase 4; explicit exclusion                                     |
| UI-020 | Page headers, page loading/empty/error states                                                                   | Reusable composition and content slots                                                | Page-level coverage                                                                           | Keep in `components/common`; compose UI primitives after Phase 2                                                                               | Through composed primitives only                      | Phase 3                                                         |
| UI-021 | Markdown reader (`Markdown`, `.cc-md`)                                                                          | Sanitization, link/code/table behavior, frozen visuals                                | `Markdown.test.tsx`, chat/task tests                                                          | Keep domain renderer and protected CSS; never a Shadcn component                                                                               | No                                                    | Protected contract                                              |
| UI-022 | Milkdown/Crepe editor                                                                                           | Editor state, selection, menus, serialization, third-party DOM                        | Documents page tests currently mock editor                                                    | Keep third-party editor and scoped theme adapter; do not replace internal UI with Shadcn                                                       | No direct Radix                                       | Phase 5 bridge                                                  |
| UI-023 | Monaco, xterm, current file-manager surfaces                                                                    | Specialized third-party/domain APIs                                                   | Monaco mocks, strong xterm tests, file-manager tests                                          | Keep APIs; add scoped appearance bridges. No Shadcn replacement                                                                                | No                                                    | Phase 5                                                         |
| UI-024 | Generic semantic HTML                                                                                           | Browser semantics and CC fallback typography                                          | No current global contract                                                                    | Style in Tailwind `@layer base`; never wrap tags in Shadcn merely for typography                                                               | No                                                    | Phase 1                                                         |

## First approved Phase 2 implementation batch

The first batch is intentionally narrow and has concrete Phase 3 consumers.

### Approved files

- `components/ui/button.tsx`
- `components/ui/dialog.tsx`
- `components/ui/alert-dialog.tsx`
- `lib/cn.ts` or the existing equivalent if one is found before implementation

### Approved dependencies

- Unified `radix-ui` package for Dialog and AlertDialog.
- `class-variance-authority` for small typed Button variants.
- `clsx` and `tailwind-merge` for the shared `cn` utility, only if the repository
  still lacks an equivalent.

### Concrete consumers

- `ConfirmDialog` becomes the first AlertDialog composition.
- `DocumentCreateDialog` and `DocumentFolderDialog` are the first ordinary
  Dialog consumers after their existing APIs and tests are preserved.
- Buttons inside those compositions exercise Button primary, secondary, and
  danger variants.

### Required pre-migration tests

- Focus moves into the dialog and returns to the trigger.
- Escape and overlay behavior match the approved contract.
- Destructive confirmation initially focuses the safe action.
- Titles/descriptions are accessible.
- Existing confirm/document callbacks, disabled states, and validation remain.
- Default light/dark visual comparisons use DS-0004 baselines.

No other Shadcn files or dependencies are approved in batch 1.

## Explicit Shadcn/Radix exclusions

- Unclassed HTML typography.
- `.cc-md`, `.cc-md--chat`, and Markdown rendering components.
- Milkdown internal editor UI.
- Page layout, responsive grids, pane sizing, and ordinary Tailwind composition.
- Monaco, xterm, file-manager, assistant-ui, or other third-party internals.
- Composer mention popovers that must retain textarea focus.
- Terminal/editor tab controllers and domain-specific tab behavior.
- Provider branding and icon artwork.
- Simple native select, checkbox, and radio controls without demonstrated custom
  behavior.

## Direct-Radix exceptions

None approved. If a later domain surface cannot compose a CC-owned primitive,
its task must update this matrix with the exact path, missing behavior, and
focused tests before importing Radix directly.

## Verification record

- Custom role/file searches reconciled with matrix families: Yes.
- Existing direct Radix imports: None.
- Every matrix row has a final classification: Yes.
- First batch has concrete consumers and bounded dependencies: Yes.
- Markdown, Milkdown, generic HTML, layout, and third-party internals excluded:
  Yes.
- CC semantic appearance contract required for all approved primitives: Yes.
