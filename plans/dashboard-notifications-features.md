# Dashboard notification features

Status: Implemented and verified

Depends on refactoring commit: `8cc8f4ea`

Source of product decisions:
`plans/dashboard-notifications-redesign.md`

## Goal

Finish and accept the notification behaviors defined in the high-level redesign after
the structural refactor. The refactoring commit already contains working versions of
most behaviors, so this plan does not reimplement them. It treats those implementations
as a baseline, adds the missing behavioral proof, and changes code only where that proof
finds a gap.

## Baseline audit

| Feature                          | Present in the refactor                                                | Remaining work                                                             |
| -------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| All / Needs attention / Resolved | Three filters, counts, and `action_required` membership                | Add mobile filter/count acceptance coverage                                |
| Task-completed classification    | New and existing `task_completed` activity uses `info`                 | Treat migration and producer tests as accepted; no duplicate work          |
| Mark read                        | Left-exit transition, swipe path, archive mutation                     | Prove duplicate guarding, reduced motion, gesture boundaries, and rollback |
| Mark unread                      | Backend/API operation, optimistic UI, Resolved action                  | Prove cache movement/count rollback and mobile flow                        |
| Mark all as read                 | Confirmation and optimistic cache update                               | Prove cancel/failure behavior and surface failure accessibly               |
| Source specialist                | Normalized ID/slug payload and specialist avatar resolution            | Treat producer/card coverage as accepted unless a fixture exposes a gap    |
| Structured run output            | Typed payload and collapsible card section                             | Treat producer/card coverage as accepted unless a fixture exposes a gap    |
| Mobile notification feed         | Teaser, full-screen feed, filters, position, snap cards, fixed regions | Cover position updates, filter reset, close, actions, and read-state flows |

## Feature 1 — Reliable read-state operations

### Behavior

- Mark read moves one pending activity to Resolved optimistically.
- Mark unread moves one resolved activity back to pending optimistically.
- `actionRequiredCount` changes only when the moved activity has
  `level === "action_required"`.
- Mark all read moves every pending activity to Resolved only after confirmation.
- Any failed mutation restores both query caches and gives the operator an accessible
  error in the active desktop or mobile surface.

### Tasks

- [x] Add focused TanStack Query hook tests for archive, unarchive, and archive-all.
- [x] Cover optimistic pending/resolved movement and canonical ordering.
- [x] Cover attention-count increment/decrement for action-required versus info rows.
- [x] Cover rollback of both caches for each failed mutation.
- [x] Add explicit cancel and failed-request coverage to Mark all as read.
- [x] Surface archive/unarchive errors inside the mobile dialog as well as desktop.
- [x] Surface archive-all failure beside its confirmation/action instead of silently
      leaving the dialog open.

Verify: hook and panel tests demonstrate cache contents before resolution, after
success, and after failure without relying only on refetch invalidation.

## Feature 2 — Read animation and swipe behavior

### Behavior

- Clicking Mark read and completing a qualifying swipe use the same resolve path.
- A qualifying card exits left once and submits one archive request.
- A short or primarily vertical gesture does not resolve the card.
- Gestures starting on interactive content never hijack its native interaction.
- Reduced-motion users do not wait for the visual transition.

### Tasks

- [x] Add fake-timer coverage for click-triggered exit and reduced-motion completion.
- [x] Add pointer coverage for below-threshold snap-back and vertical intent.
- [x] Add pointer coverage for buttons, links, fields, labels, and checkboxes.
- [x] Add duplicate click/swipe guarding coverage while a card is exiting.
- [x] Correct only behavior exposed by these tests; keep one card-level resolve path.

Verify: component tests prove one mutation per successful gesture, zero mutations for
cancelled gestures, and unchanged native controls.

## Feature 3 — Mobile notification workflow

### Behavior

- The dashboard teaser opens and closes the full-screen notification surface.
- All three filters show their correct counts and reset the position to the first card.
- Vertical snapping updates `N of M` as the visible card changes.
- Fixed card headers and footers preserve native body scrolling.
- Primary and secondary actions remain usable, including Accept, Open task, Mark read,
  and Mark unread.

### Tasks

- [x] Add component coverage for mobile filter changes and position reset.
- [x] Add feed coverage for scroll-derived position updates and empty states.
- [x] Extend Playwright fixtures to contain multiple info, action-required, and
      resolved activities.
- [x] Add a mobile Playwright flow for filter counts, snapping to the next card, and
      closing/reopening at the first position.
- [x] Add mobile Playwright flows for Mark read and Mark unread.
- [x] Exercise one multi-action card and retain the proportional horizontal footer
      assertion introduced during refactoring.
- [x] Verify the body can scroll vertically without triggering a horizontal resolve.

Verify: the focused notification Playwright spec covers the complete mobile workflow
at a 390px viewport, while component tests own exact state transitions.

## Feature 4 — Data and presentation acceptance

The refactor already implements source-specialist identity, structured run output,
task-completed `info` classification, and the historical data migration. This phase is
an acceptance audit, not a second implementation pass.

### Tasks

- [x] Confirm producer coverage for task runs, notification tools, proposals, and
      secret requests includes normalized source identity where context exists.
- [x] Confirm distinct `resultText` is rendered as run output and duplicate/missing
      output is omitted.
- [x] Run migration tests against a database containing pending and archived
      `task_completed` rows plus unrelated action-required rows.
- [x] Add code only if one of these acceptance cases is not already covered.

Verify: the data contract is proven across shared schemas, producers, migration, API,
and card rendering without adding presentation snapshots or reference pills.

## Sequence and review checkpoints

1. Read-state cache tests and error presentation.
2. Animation/swipe boundary tests and any resulting fixes.
3. Mobile workflow component and Playwright coverage.
4. Data/presentation acceptance audit.
5. Full regression and visual review.

Pause for review after each of the first four checkpoints so behavior changes remain
separate from test-only hardening.

## Completion checks

```bash
pnpm eslint --fix <touched files>
pnpm design-system:audit
pnpm typecheck
pnpm test
pnpm --filter @cc/frontend exec playwright test e2e/dashboard-notifications.spec.ts --project=chromium
```

Manually inspect desktop and mobile in light and dark modes with long Markdown, long
code/output, multiple acceptance criteria, empty filters, and simulated mutation
failures.

## Out of scope

- New notification kinds or delivery channels.
- Reference pills.
- Global shell, sidebar, or dashboard widget changes.
- Pagination or server-side Needs attention filtering unless real query volume makes
  client-side filtering unsuitable.
- Portable persistence for runtime notification history.
