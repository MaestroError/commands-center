# Dashboard notifications redesign

Status: Implemented

## Goal

Refactor the dashboard activity feed to match the supplied Dashboard Notifications
prototype while preserving the existing activity actions and data flows. The result
should make specialist activity easier to scan, expose action-required items as a
first-class filter, support reversible read state, and provide a purpose-built mobile
notification experience.

Reference design:
`/Users/revazgh/Downloads/Dashboard notifications redesign/Dashboard Notifications.dc.html`

## Confirmed product decisions

- The dashboard filters are **All**, **Needs attention**, and **Resolved**.
- **All** contains every unresolved/pending activity, including both successful
  informational activity and action-required activity. It never contains resolved
  activity.
- **Needs attention** contains unresolved activities whose existing `level` is
  `action_required`. Notification kind is not used to decide membership in this
  filter.
- **Resolved** contains activities that have been marked read/archived.
- Resolved cards expose a **Mark unread** action.
- Marking an individual card read removes it from the current unresolved view
  immediately with a short left-exit animation. The mutation remains optimistic and
  must restore the card and surface an error if the request fails.
- Swiping a card aside marks it read. Desktop may use the card surface; mobile uses
  the card header/drag handle so vertically scrolling card content remains reliable.
- **Mark all as read** retains the existing confirmation dialog. Confirming marks all
  unresolved activities read and removes them from unresolved views.
- Reference pills such as `PR #171` or `#G2` are not rendered.
- The existing application sidebar and global header are outside this redesign. The
  prototype's placeholder shell and reserved right column are layout context, not new
  dashboard features.
- Completed top-level task runs use `level: "info"`. This removes ordinary successful
  completions from **Needs attention** without changing their Accept, Open task, or
  Mark read actions, which remain keyed by activity kind rather than level.
- Existing `task_completed` history is reclassified to `info` through a data migration
  so current feeds adopt the corrected semantics, not only newly emitted activity.
- Card action buttons retain a 44px minimum touch target below the desktop breakpoint
  but use the design system's compact intrinsic height on desktop to match the supplied
  card reference.
- Desktop feed and card wrappers use zero-minimum grid tracks plus full/max-width
  constraints so long Markdown, code, and commands scroll or wrap inside the panel
  rather than widening cards beyond it.
- Source metadata reads **[status] by [specialist avatar] [specialist name]** whenever
  a source specialist is available; cards without a source omit the whole attribution.
- Mobile card footers use a theme-owned upward elevation shadow, matching the fixed
  footer separation visible in the supplied reference.
- Mobile cards use an inset rounded surface with the semantic status rail clipped by
  the card radius. Their compact header is metadata-first: icon, status, “by”, source
  specialist, and time share the first row; the title sits below them.
- Mobile header and footer surfaces use paired theme-owned elevation shadows around
  the independently scrolling body. The footer uses the elevated surface role and
  keeps every action in one horizontal row: the primary action expands into the
  remaining width while secondary actions keep their intrinsic width. Desktop actions
  stay intrinsic-width.

## Follow-up tasks

- [x] Emit `task_completed` activities with `level: "info"` and update producer tests.
- [x] Reclassify existing `task_completed` activity rows with a tracked data migration.
- [x] Reduce desktop activity action height while preserving mobile touch targets.
- [x] Run focused and full verification, including migration, frontend, lint,
      typecheck, design-system audit, and notification Playwright coverage.
- [x] Constrain feed and card widths against long min-content.
- [x] Add the “by” specialist attribution connector.
- [x] Add the semantic upward shadow to mobile fixed card footers.
- [x] Verify the containment and footer presentation across unit and browser tests.
- [x] Match the reference mobile card inset, radius, status rail, and compact header.
- [x] Add the paired mobile header/footer elevations and elevated footer surface.
- [x] Make mobile action rows use the full footer width while preserving desktop sizing.
- [x] Add responsive component and browser coverage for the reference geometry.
- [x] Keep multi-action mobile footers on one horizontal row.
- [x] Make the primary action flexible and secondary actions intrinsic-width.
- [x] Add component and browser coverage for a three-action mobile footer.

## Filter and count semantics

| Filter          | Source              | Membership                                            | Count                              |
| --------------- | ------------------- | ----------------------------------------------------- | ---------------------------------- |
| All             | Pending activities  | `status === "pending"`                                | All pending activities             |
| Needs attention | Pending activities  | `status === "pending" && level === "action_required"` | Pending action-required activities |
| Resolved        | Archived activities | `status === "archived"`                               | All archived activities            |

The initial implementation should reuse the existing pending and archived activity
queries. **Needs attention** can be derived from the pending response, whose existing
`actionRequiredCount` already supplies the count. Avoid adding a new filtering API
unless query size or pagination makes client-side filtering unsuitable.

## Visual and structural scope

- Change the dashboard content heading to **Latest activity** and use the prototype's
  catch-up description.
- Replace the current two-tab underline treatment with the three compact filter
  controls and visible counts.
- Restyle cards with:
  - A semantic status-colored left edge and icon tile.
  - Title and relative timestamp in the header.
  - Activity-kind badge plus source specialist avatar/name.
  - A readable, naturally flowing Markdown body with styled links and inline code.
  - Clearly separated run output, artifact, acceptance-criteria, question, and action
    sections when those sections exist.
  - Semantic danger, warning, success, and accent roles from the CC design system;
    no raw palette roles or component-owned theme branching.
- Keep acceptance criteria interactive where they are interactive today. Add the
  prototype's checked-count summary and desktop expand/collapse treatment.
- Preserve existing kind-specific actions: fill secret, accept, reply, open task,
  proposal review/create, and mark read.
- Do not render empty metadata rows or placeholder sections.
- Use existing CC-owned buttons, inputs, dialogs, tabs, checkboxes, Markdown rendering,
  and Lucide icons. Respect reduced-motion preferences for card transitions.

## Mobile experience

- Render a compact dashboard Notifications teaser with unresolved count and latest
  activity time.
- Open notifications into a full-screen feed with a close action, the three filters,
  and a position indicator such as `1 of 5`.
- Present one card per viewport using vertical scroll snapping.
- Keep the card header and action footer visible while the card body scrolls.
- Preserve touch scrolling by limiting horizontal swipe initiation to the intended
  header/drag surface.
- Maintain accessible 44px minimum touch targets and keyboard/screen-reader access to
  every action; swipe is an enhancement, never the only way to mark a card read.

## Data and API requirements

### Reuse existing data

- `Activity.status` remains the source of read state: `pending` is unread and
  `archived` is resolved/read.
- `Activity.level` is the sole source for the **Needs attention** filter.
- Existing title, body, kind, timestamps, task/task-run links, artifacts, review
  question, suggested replies, and acceptance criteria remain authoritative.
- Existing kind metadata supplies the notification label, icon, and semantic visual
  treatment. Add or refine registry mappings instead of introducing a separate
  presentation-only status field unless a producer cannot express the required state.

### Add or expose required data

- Normalize source-specialist identity inside the existing activity payload instead
  of adding presentation snapshots to the activity row:
  - Task-run activities write `sourceSpecialistId` from `run.agentId`.
  - Specialist-authored notifications and proposals write
    `sourceSpecialistSlug` from the calling MCP context. Existing
    `proposedBySlug` remains supported while producers migrate to the normalized key.
  - The frontend resolves the ID/slug through the existing specialists query and
    reuses `SpecialistAvatar`. If the specialist is unavailable, render the slug (or
    omit the metadata row) rather than persisting a copied display name as identity.
- Add a typed optional `runOutput` string in the activity payload for terminal
  activities. For completed/review outcomes, use `finalMessage` as the readable body
  and retain a distinct `resultText` as `runOutput`; omit the section when the values
  are missing or equivalent. Failure diagnostics remain human-readable body content
  unless a producer deliberately supplies separate raw output.
- Do not add a reference-pill field for this redesign.
- These payload additions use the existing `payload_json` column, so no Drizzle
  migration is expected.

### Read-state operations

- Continue using the existing archive operation for **Mark read** and the existing
  archive-all operation for confirmed **Mark all as read**.
- Add an idempotent unarchive/mark-unread service operation and API endpoint that moves
  an archived activity back to `pending`, clears `archivedAt`, updates `updatedAt`, and
  returns the canonical activity.
- Add TanStack Query mutations for mark read, mark unread, and mark all read with
  optimistic cache movement between pending and resolved results, correct
  `actionRequiredCount` updates, rollback on failure, and final invalidation of both
  activity queries.
- No new portable workspace state is required. Activity read state and run output are
  runtime history and may remain in SQLite under the Portable Workspace Rule.

## Implementation tasks

- [x] Update shared activity contracts and activity producers for source-specialist
      metadata and optional structured run output.
- [x] Add and test the backend mark-unread operation; generate a Drizzle migration only
      if the chosen specialist relationship or run-output storage requires schema
      columns rather than the existing payload.
- [x] Consolidate dashboard feed state around the three confirmed filters and their
      counts, reusing pending/archived queries and `action_required` filtering.
- [x] Refactor the activity card structure and optional content sections to match the
      desktop design while preserving all existing kind-specific actions.
- [x] Add optimistic left-exit mark-read animation, swipe-to-read, rollback behavior,
      and reduced-motion handling.
- [x] Add **Mark unread** to Resolved cards with optimistic removal from Resolved and
      reinsertion into pending results.
- [x] Keep and restyle the existing **Mark all as read** confirmation flow.
- [x] Implement the mobile teaser and full-screen, scroll-snapping notification feed.
- [x] Update the activity bell only where shared card/data changes require it; its
      compact needs-attention behavior remains based on `action_required`.
- [x] Add unit, integration, and Playwright coverage for the confirmed semantics and
      interactions.

## Refactoring architecture

### Feed ownership

`ActivityPanel` becomes the state owner for the dashboard feed. It loads pending and
resolved activity results, owns the active filter, derives counts, and passes a single
display list into one feed renderer. This replaces the current split between
`ActivityThread` and `ResolvedActivityList`, which would otherwise duplicate loading,
empty, animation, and mutation behavior across three filters.

The feed renderer owns only list presentation and transient exit/drag state. Activity
server state remains in TanStack Query; no Zustand or new context is needed.

### Card contract

Replace the current `readOnly`/`onArchive` combination with an explicit card mode and
read-state callbacks:

- `mode: "pending" | "resolved" | "compact"`
- `onMarkRead` for pending dashboard and bell cards
- `onMarkUnread` for resolved dashboard cards

`compact` preserves the activity-bell presentation and must not render the expanded
dashboard sections. The dashboard card keeps kind-specific actions in
`ActivityActions`; read-state actions are passed explicitly so marking unread does not
masquerade as a generic archive action.

Extend `activity-registry.tsx` to be the single mapping for each kind's label, icon,
and semantic tone. `level` controls filter membership only; it does not replace the
kind-specific label or visual meaning.

### Read transition controller

Use one card-level resolve path for the **Mark read** button and swipe gesture:

1. Set local exit state and transition the card left with a small opacity reduction.
2. On transition completion, call the existing optimistic archive mutation so the
   card is removed from pending query data before the request resolves.
3. If the request fails, Query rollback restores the card and an accessible inline or
   feed-level error is shown.
4. Under reduced motion, skip the transition and invoke the mutation immediately.

Use pointer events with horizontal-intent detection and a threshold. Ignore gestures
that originate on buttons, inputs, links, textareas, labels, or checkboxes. A swipe
below threshold snaps back; a qualifying swipe uses the same exit path as the button.

### Query cache behavior

- Archive one: remove from pending cache, decrement `actionRequiredCount` only for an
  `action_required` activity, and invalidate pending plus resolved queries on settle.
- Unarchive one: remove from resolved cache, insert into pending cache in the service's
  canonical order, increment `actionRequiredCount` only when applicable, and
  invalidate both queries on settle.
- Archive all: keep the confirmation dialog, then optimistically clear pending
  activities and set its count to zero; invalidate both queries on settle.
- Filter changes are local and never trigger status mutations.

### Responsive structure

Keep one content model and two responsive presentations rather than duplicating card
business logic:

- Desktop/tablet renders the filter bar and flowing card list in the dashboard panel.
- Mobile renders the teaser in the dashboard and mounts a full-screen feed surface
  when opened. The same card sections and actions are composed into a constrained
  header/body/footer layout.
- The scroll-snap position is derived from the active filtered list and resets to the
  first card when the filter changes or the feed opens.

## Sequenced implementation plan

### Phase 1 — Lock contracts with tests

1. Add failing service/route tests for unarchiving an archived activity, idempotency,
   missing IDs, cleared `archivedAt`, and updated timestamps.
2. Add producer tests for normalized specialist identity and separation of readable
   `finalMessage` from distinct `resultText` run output.
3. Add component/query tests for the three exact filter definitions and counts.

Verify: tests fail only because the planned contracts are not implemented yet.

### Phase 2 — Backend and shared data

1. Add typed payload helpers for source specialist and optional run output without
   making the top-level activity payload non-extensible.
2. Update task-run, specialist notification/proposal, and secret-request producers to
   populate normalized specialist identity where context is available.
3. Change terminal activity construction to keep the readable summary in `body` and
   distinct raw result text in `payload.runOutput`.
4. Add `activityService.unarchive` and `POST /api/activities/:id/unarchive`.
5. Add the typed frontend API client for unarchive.

Verify: shared/backend focused tests pass and no migration is generated.

### Phase 3 — Feed state consolidation

1. Move pending/resolved queries and active-filter state into `ActivityPanel`.
2. Derive All, Needs attention, and Resolved lists/counts exactly as confirmed.
3. Replace `ActivityThread` and `ResolvedActivityList` with one feed renderer and
   filter-specific loading, error, and empty states.
4. Add the mark-unread mutation and complete optimistic cache movement/rollback for
   all three read-state operations.

Verify: unit tests prove list membership, counts, confirmation, cache movement, and
rollback before visual card work begins.

### Phase 4 — Desktop card refactor

1. Extend the activity registry with semantic tone metadata.
2. Refactor `ActivityCard` into the prototype hierarchy: status/header metadata,
   readable body, optional run output, artifacts, acceptance criteria, question, and
   action row.
3. Resolve and render source specialist identity using the specialists query and
   `SpecialistAvatar`; do not render reference pills.
4. Add criteria checked-count and desktop disclosure while preserving task-backed
   checkbox behavior.
5. Keep `ActivityActions` behavior unchanged except for the explicit read-state
   callback contract.
6. Update `ActivityBell` to use the compact card mode without inheriting expanded
   dashboard layout.

Verify: component tests cover every kind/action plus optional-section combinations,
and design-system audit passes.

### Phase 5 — Read animation and swipe

1. Add the shared card resolve transition used by the button and pointer gesture.
2. Add horizontal-intent detection, threshold/snap-back behavior, interactive-element
   exclusions, and reduced-motion handling.
3. Ensure fast repeated clicks/swipes cannot submit duplicate archive mutations.
4. Surface mutation failure after rollback.

Verify: fake-timer/pointer tests cover exit completion, snap-back, duplicate guarding,
rollback, reduced motion, and unaffected interactive controls.

### Phase 6 — Mobile feed

1. Add the dashboard Notifications teaser with All count and latest pending time.
2. Add the full-screen feed surface with close control, filters/counts, position
   indicator, scroll snapping, and empty states.
3. Compose the same card content into fixed header, scrollable body, and fixed action
   footer regions.
4. Limit swipe initiation to the mobile header surface and verify vertical body
   scrolling remains native.

Verify: responsive component and Playwright tests exercise opening, filtering,
scrolling, replying/accepting, swiping, marking unread, and closing.

### Phase 7 — Regression and final verification

1. Update the dashboard notification Playwright fixtures to return pending and
   archived results correctly and support archive/unarchive/archive-all routes.
2. Run focused suites during implementation, then ESLint with `--fix`, full tests,
   typecheck, design-system audit, and the focused Chromium E2E spec.
3. Manually inspect desktop and mobile light/dark modes for long Markdown, long URLs,
   many criteria, empty filters, and mutation failures.

Verify: all success criteria pass without changes to the global shell or unrelated
dashboard surfaces.

## Expected touch points

- `packages/shared/src/schemas/activities.ts`
- `packages/backend/src/services/activity-service.ts`
- `packages/backend/src/services/task-activity.ts`
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/routes/activities.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-notifications/tools/notification-tools.ts`
- `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/request-secret.ts`
- Matching backend service, route, producer, and terminal-activity tests
- `packages/frontend/src/lib/api/settings.ts` activity client and API tests
- `packages/frontend/src/hooks/use-activities-query.ts`
- `packages/frontend/src/pages/DashboardPage.tsx`
- `packages/frontend/src/components/activities/ActivityPanel.tsx`
- `packages/frontend/src/components/activities/ActivityThread.tsx` and
  `ResolvedActivityList.tsx` (replace/remove after consolidation)
- `packages/frontend/src/components/activities/ActivityCard.tsx`
- `packages/frontend/src/components/activities/ActivityActions.tsx`
- `packages/frontend/src/components/activities/activity-registry.tsx`
- `packages/frontend/src/components/activities/ActivityBell.tsx`
- Matching frontend unit tests and
  `packages/frontend/e2e/dashboard-notifications.spec.ts`

## Review checkpoints

Implementation should stop for review after each independently verifiable slice:

1. Backend payload/unarchive contract.
2. Three-filter feed state and optimistic cache behavior.
3. Desktop visual refactor and action preservation.
4. Swipe/animation behavior.
5. Mobile full-screen feed.

This keeps structural/data changes reviewable before the more subjective responsive
and motion work is layered on top.

## Verification and tests

- Filter tests prove:
  - All shows pending success/info and pending action-required activities.
  - All excludes archived activities.
  - Needs attention uses `level === "action_required"` only.
  - Resolved shows archived activities and exposes **Mark unread**.
- Mutation tests prove individual mark-read and mark-unread cache movement, count
  updates, rollback, and backend idempotency.
- Mark-all tests preserve the confirmation dialog and verify cancel versus confirm.
- Card tests cover source specialist rendering, missing optional sections, run-output
  expand/collapse, artifacts, criteria progress, questions, and existing action sets.
- Interaction tests cover button-triggered read, swipe-triggered read, animation-end
  removal, reduced-motion behavior, and vertical-scroll/swipe coexistence on mobile.
- Responsive tests cover the dashboard teaser, full-screen feed, filters, position
  indicator, fixed action area, and scroll snapping.
- Existing activity bell, proposal, secret, task acceptance, and review-reply flows
  remain passing.

Required completion checks:

```bash
pnpm eslint --fix <touched files>
pnpm design-system:audit
pnpm typecheck
pnpm test
pnpm --filter @cc/frontend exec playwright test e2e/dashboard-notifications.spec.ts --project=chromium
```

## Success criteria

- The three filters and counts follow the confirmed definitions exactly.
- Mark read hides a card immediately with a short left-exit transition and safely
  rolls back on failure.
- Resolved activities can be marked unread and return to the unresolved feed.
- Mark all read always requires confirmation.
- Notification cards render source specialist identity and structured run output when
  available, without reference pills.
- Desktop and mobile layouts match the prototype's information hierarchy while using
  the canonical CC design system and preserving every existing activity action.

## Out of scope

- Redesigning the global application header or sidebar.
- Implementing the prototype's reserved future dashboard widget.
- Adding PR/task reference pills.
- Changing which activities producers emit or making specialist notifications
  blocking.
- Persisting activity history or read state as portable workspace configuration.
