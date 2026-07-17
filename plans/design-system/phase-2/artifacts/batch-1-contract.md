# Batch 1 Primitive Contract

- Task: [DS-0201](../01-batch-contract.md)
- Phase: [Phase 2](../README.md)
- Evidence:
  [adoption matrix](../../phase-0/artifacts/component-adoption-matrix.md) (UI-001,
  UI-008, UI-009),
  [downstream reassessment](../../phase-0/artifacts/downstream-phase-reassessment.md),
  [Phase 1 sign-off](../../phase-1/artifacts/phase-1-signoff.md)
- Status: Frozen

## 1. Current-repository inventory (revalidated post–Phase 1)

Searches re-run against the stabilized Phase 1 frontend:

| Check                                                                    | Result                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/components/ui/` boundary                                            | Does not exist — clean slate.                                                                          |
| `src/lib/cn.ts` (or any `cn.*`)                                          | None — batch may add it.                                                                               |
| `components.json`                                                        | None.                                                                                                  |
| `radix-ui` / `class-variance-authority` / `clsx` / `tailwind-merge` deps | None present; all four are net-new.                                                                    |
| Direct `radix-ui` imports                                                | None anywhere in the frontend.                                                                         |
| `cc-button*` classes (defined in `styles/globals.css`)                   | `cc-button` (249 uses), `cc-button-secondary` (155), `cc-button-danger` (15), `cc-button-primary` (5). |
| Phase 3 consumers                                                        | All three present (paths below).                                                                       |

Consumer files:

- `src/components/common/ConfirmDialog.tsx`
- `src/components/documents/DocumentCreateDialog.tsx`
- `src/components/documents/DocumentFolderDialog.tsx`

Every assumption in the Phase 0 adoption matrix still holds; nothing drifted.

## 2. `cc-button` visual contract (source of truth to preserve)

From `styles/globals.css`:

- `.cc-button` (base = primary): `bg-accent`, `text-on-accent`, `hover:bg-accent-hover`,
  `disabled:opacity-60 disabled:cursor-not-allowed`, `focus-visible` outline on
  `--focus-ring`, `--radius-pill`, `--font-weight-control`.
- `.cc-button-secondary`: `border-border`, `bg-surface`, `text-text-primary`,
  `hover:bg-surface-elevated`.
- `.cc-button-danger`: `bg-danger`, `text-on-danger`, `hover:brightness-110`.

`cc-button-primary` exists but adds no declarations of its own; base `cc-button`
already renders the primary appearance. The typed primitive treats **primary as
the base variant** and keeps `cc-button-primary` untouched as a compatibility
class.

## 3. Frozen public APIs

### 3.1 `cn` (`src/lib/cn.ts`)

- Export: `cn(...inputs: ClassValue[]): string`.
- Composes conditional classes (`clsx`) and resolves Tailwind conflicts
  (`tailwind-merge`). No other export.

### 3.2 Button (`src/components/ui/button.tsx`)

- Named export `Button`, forwarding `ref` to the native `<button>`.
- Props: all native `button` attributes **plus** `variant?: "primary" | "secondary" | "danger"`
  (default `"primary"`) and `className?: string` merged via `cn`.
- Renders the compatibility classes internally:
  - `primary` → `cc-button`
  - `secondary` → `cc-button cc-button-secondary`
  - `danger` → `cc-button cc-button-danger`
- CVA is used only for these three variants.

**Excluded from batch 1** (add only when a named consumer requires it, via a
matrix update): `asChild`/polymorphism, `IconButton`, `loading`/pending state,
a size catalogue, link/anchor rendering, icon-slot props.

### 3.3 Dialog (`src/components/ui/dialog.tsx`)

Structural exports only, over Radix Dialog: `Dialog` (root), `DialogTrigger`,
`DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`,
`DialogTitle`, `DialogDescription`, `DialogClose`. Controlled and uncontrolled
open state via Radix's public props. No domain callbacks, labels, form state, or
mutation handling.

### 3.4 AlertDialog (`src/components/ui/alert-dialog.tsx`)

Structural exports only, over Radix AlertDialog: `AlertDialog` (root),
`AlertDialogTrigger`, `AlertDialogPortal`, `AlertDialogOverlay`,
`AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`,
`AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`,
`AlertDialogCancel`. Actions compose the CC `Button` visual contract; the
primitive hardcodes no labels or domain callbacks.

## 4. Variant / state coverage table

| Primitive   | Variants / states to prove in gallery + tests                                                |
| ----------- | -------------------------------------------------------------------------------------------- |
| Button      | primary, secondary, danger × {default, hover, focus-visible, disabled}                       |
| Dialog      | trigger-driven + controlled; title, description, footer actions; long content; 320/390 width |
| AlertDialog | ordinary confirm + destructive confirm; disabled action; safe initial focus; 320/390 width   |

All states use CC semantic tokens in Default light and dark; no component branches
on theme id or resolved mode.

## 5. Interaction contract

| Behavior                     | Ordinary Dialog                          | Destructive AlertDialog                                  |
| ---------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Initial focus                | First focusable / Radix default          | **Safe action (Cancel)** — never the destructive action  |
| Focus containment            | Radix modal focus trap                   | Radix modal focus trap                                   |
| Focus return                 | Returns to the invoking control          | Returns to the invoking control                          |
| Escape                       | Closes                                   | Cancels (routes to Cancel); never runs the danger action |
| **Overlay (backdrop) click** | **Closes** (approved)                    | **Does not dismiss** the danger action (approved)        |
| Accessible naming            | Title required; description when present | Title + description; `role` = alertdialog                |
| Disabled action              | Not activatable by pointer or keyboard   | Not activatable by pointer or keyboard                   |

**Recorded overlay-dismissal decision:** ordinary dialogs close on outside/backdrop
click and Escape; destructive alert dialogs require an explicit Cancel/Confirm and
must not fire the destructive action through Escape or overlay interaction.

Test-layer split:

- **Unit / Testing Library (jsdom):** composition, accessible naming,
  controlled-state changes, callback wiring, disabled action, variant class output.
- **Playwright (real browser):** focus entry/containment/return, Tab/Shift+Tab,
  Escape, pointer overlay behavior, portal layering, safe destructive focus,
  and 320/390 narrow containment (jsdom cannot prove these).

## 6. Dependency allowlist (complete)

`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` — direct
frontend dependencies, added in DS-0202. Any addition beyond these requires a
matrix update. The Shadcn init must reject its generated palette, radius,
typography, reset, and animation packages, and must not create a second Tailwind
config.

## 7. Phase 3 consumer compatibility checklist

Current public props/behavior to preserve when Phase 3 migrates each consumer:

### ConfirmDialog (→ AlertDialog)

Props: `title`, `description: ReactNode`, `confirmLabel`,
`confirmVariant?: "primary" | "danger"`, `onConfirm`, `onCancel`,
`secondaryLabel?`, `onSecondary?`, `confirmDisabled?`. Behavior: portal to
`document.body`; `role="dialog"`/`aria-modal`; labelled by title; confirm uses
`cc-button` (+ `cc-button-danger` when danger); optional secondary button;
always-present Cancel; `confirmDisabled` disables confirm.
**Migration note:** current implementation dismisses on backdrop click via
`onCancel` even for destructive; Phase 3 deliberately changes destructive
overlay/Escape dismissal per §5 and adds safe initial focus + focus return.

### DocumentCreateDialog / DocumentFolderDialog (→ Dialog)

Props: `onClose`, `scope?`, `ownerSlug?`, and `defaultFolder?` / `defaultParent?`.
Behavior to keep intact: title-slug path derivation and `.md` enforcement
(create); trailing-slash rejection / `canSubmit` gating (folder);
`useMutation` + `documentTree` invalidation + `onClose` on success; error text on
failure; Create disabled while pending or invalid. These are **domain** behaviors
and stay in the consumer; Phase 3 only swaps the modal shell.

## 8. Pre-migration test additions

- ConfirmDialog previously had only a portal-rendering test. Added focused tests
  locking the **preserved** contract: confirm/cancel/secondary callbacks,
  `confirmDisabled` blocking activation, danger-variant class output, and
  accessible naming. (Overlay-dismissal behavior is intentionally **not** locked,
  since §5 changes it for destructive dialogs in Phase 3.)
- DocumentCreateDialog and DocumentFolderDialog already protect their path
  derivation, disabled-state, submission, and validation behavior; no new tests
  required.

No expected-failing tests were added.

## 9. Acceptance verification

- [x] Every proposed export maps to the approved first batch (UI-001/008/009).
- [x] Button limited to primary/secondary/danger + native props; `asChild`,
      loading, sizes, IconButton excluded.
- [x] Dialog/AlertDialog structural exports cover the three named consumers
      without embedding domain behavior.
- [x] Ordinary vs destructive overlay/Escape behavior is explicit and testable.
- [x] Consumer callback/validation/pending/error/close behavior recorded and
      covered.
- [x] `radix-ui`, CVA, `clsx`, `tailwind-merge` are the complete direct-dependency
      allowlist.
- [x] No expansion into Input, Select, DropdownMenu, Tooltip, Switch, Tabs,
      domain surfaces, Markdown, or editor internals.
- [x] Phase 3 remains the owner of production consumer migration.
