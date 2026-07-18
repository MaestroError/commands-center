# Phase 2 — Establish Typed UI Primitives

- Status: Complete

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-2--establish-typed-ui-primitives)

Required evidence:

- [Component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)
- [Downstream phase reassessment](../phase-0/artifacts/downstream-phase-reassessment.md)
- [Phase 1 sign-off](../phase-1/artifacts/phase-1-signoff.md)

## Goal

Create and prove CC's first copy-owned, typed UI primitives without redesigning
screens or starting the Phase 3 consumer migration. The batch is limited to
`cn`, Button, Dialog, and AlertDialog, backed by the established semantic theme
contract and Radix behavior where interaction complexity warrants it.

## Delivery strategy

1. Freeze the exact batch API, dependency allowlist, and behavioral contract.
2. Establish the minimal Shadcn/Radix ownership boundary and `cn` utility.
3. Implement Button before overlay primitives so dialog actions consume it.
4. Implement and test Dialog and AlertDialog independently.
5. Add real primitive states and interactions to the existing development-only
   design-system fixture.
6. Verify import boundaries, theme behavior, protected surfaces, production
   exclusion, and repository health before Phase 3 is unblocked.

Shadcn is an implementation starting point, not a runtime component library or
visual source of truth. Radix owns focus, keyboard, portal, and modal behavior;
CC owns the exported API, semantic Tailwind classes, visual states, and tests.

## Task sequence

| ID      | Task                                                                                   | Blocked by                | Status   |
| ------- | -------------------------------------------------------------------------------------- | ------------------------- | -------- |
| DS-0201 | [Freeze the first primitive-batch contract](01-batch-contract.md)                      | Phase 1                   | Complete |
| DS-0202 | [Initialize the minimal Shadcn/Radix boundary and `cn`](02-shadcn-radix-foundation.md) | DS-0201                   | Complete |
| DS-0203 | [Implement the typed Button primitive](03-button-primitive.md)                         | DS-0202                   | Complete |
| DS-0204 | [Implement the Dialog primitive](04-dialog-primitive.md)                               | DS-0202, DS-0203          | Complete |
| DS-0205 | [Implement the AlertDialog primitive](05-alert-dialog-primitive.md)                    | DS-0202, DS-0203          | Complete |
| DS-0206 | [Add the primitive gallery and appearance contracts](06-primitive-gallery.md)          | DS-0203, DS-0204, DS-0205 | Complete |
| DS-0207 | [Verify and sign off Phase 2](07-phase-2-signoff.md)                                   | DS-0202 through DS-0206   | Complete |

Dialog and AlertDialog may be implemented independently after Button is stable.
DS-0206 remains blocked until all three primitives are available. Production
consumer migration begins only after DS-0207.

## Approved batch boundary

Phase 2 may add only:

- `packages/frontend/components.json` as the copy-owned Shadcn configuration.
- `packages/frontend/src/lib/cn.ts`.
- `packages/frontend/src/components/ui/button.tsx`.
- `packages/frontend/src/components/ui/dialog.tsx`.
- `packages/frontend/src/components/ui/alert-dialog.tsx`.
- Focused tests, fixture/gallery coverage, appearance assertions, and plan artifacts needed
  to prove those files.
- Direct frontend dependencies `radix-ui`, `class-variance-authority`, `clsx`,
  and `tailwind-merge`, after DS-0201 confirms no equivalent exists.

No other Shadcn component, Radix primitive, palette, reset, animation package,
or speculative variant is included. Existing `cc-*` classes remain a supported
compatibility API.

## Phase 2 versus Phase 3

Phase 2 creates and validates domain-neutral primitives. Phase 3 begins the
production migration with `ConfirmDialog`, `DocumentCreateDialog`, and
`DocumentFolderDialog`, preserving their public APIs and domain behavior. The
Phase 2 gallery and tests are concrete proving consumers; they do not replace
that Phase 3 migration.

## Phase exit gate

Phase 2 is complete only when:

- Every added dependency and file is in the approved batch.
- Only `components/ui/` imports Radix; no direct-Radix exception is introduced.
- Primitives use semantic CC tokens and the existing compatibility contract,
  with no Shadcn palette or theme branch.
- Button, Dialog, and AlertDialog behavior is covered through public APIs.
- Keyboard, focus entry/return, Escape, overlay, disabled, and safe destructive
  focus contracts pass in real-browser coverage where jsdom is insufficient.
- The development fixture covers every approved variant/state in Default light
  and dark at wide and narrow widths.
- Existing application, Markdown, and Milkdown baselines have no unexplained
  changes.
- Production assets contain neither the fixture nor gallery code.
- The Phase 2 sign-off explicitly authorizes Phase 3's first consumer batch.
