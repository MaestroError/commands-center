# Phase 1 — Infra: Activity store, API, transport, shell UI

Build the durable foundation: the `activities` table, an `ActivityService`, the
CRUD/count API, polling transport, and the two UI shells (nav bell + Dashboard
thread) with a generic card renderer. **No producers and no per-kind cards yet** —
those are Phase 2/3. This phase ships with tests and an end-to-end "info card →
mark read" path provable with a seeded/test activity.

Read [`00-overview.md`](00-overview.md) first.

## Deliverables

1. `activities` DB table + drizzle migration.
2. Shared Zod schemas + types in `packages/shared`.
3. `ActivityService` (create/dedupe, list, archive, counts) wired into
   `RuntimeContext`.
4. CRUD/count API routes (owner-guarded).
5. Frontend: `useActivitiesQuery` (polling) + nav bell with action-required
   badge + `DashboardPage` thread shell + generic `ActivityCard` with a per-kind
   renderer registry (only a fallback/info renderer in this phase).
6. Tests for all of the above.

## Backend

### 1.1 — Schema & types (`packages/shared/src/schemas/activities.ts`)

- [ ] `activityKindSchema` (the 6 kinds from the overview; include
      `task_run_approval` in the enum now so the approval plan can produce it
      without a schema change).
- [ ] `activityLevelSchema` = `enum(["action_required","info"])`,
      `activityStatusSchema` = `enum(["pending","archived"])`.
- [ ] `activitySchema` (id, kind, level, status, title, body, payload, dedupeKey,
      timestamps). Keep `payload` a typed `z.record`/`z.unknown` at the API
      boundary; per-kind payload shapes are validated by producers.
- [ ] `activityListResponseSchema` (`{ activities, actionRequiredCount }`).
- [ ] Export inferred types; register in `schemas/index.ts`.

### 1.2 — DB table (`db/schema/activities.ts`)

- [ ] `activities` table: `id` (pk), `kind`, `level`, `status` (default
      `pending`), `title`, `body` (nullable), `payload_json` (nullable),
      `dedupe_key` (nullable), `created_at`, `updated_at`, `archived_at`
      (nullable). Indexes on `status` and `dedupe_key`.
- [ ] Generate the drizzle migration (`pnpm drizzle-kit generate`).

### 1.3 — `ActivityService` (`services/activity-service.ts`)

Factory `createActivityService({ db, logger })`:

- [ ] `emit(input)` — create a `pending` activity; if `dedupeKey` is set and a
      non-archived row with that key exists, **update it in place** (title/body/
      payload/updatedAt) instead of inserting. Returns the row.
- [ ] `list({ status })` — newest-last (ascending `created_at`) for the thread;
      default returns `pending`.
- [ ] `actionRequiredCount()` — count `pending` + `level = action_required`.
- [ ] `archive(id)` — set `status = archived`, `archived_at = now`. Idempotent.
- [ ] `archiveByDedupeKey(key)` — for producers that supersede an earlier card.
- [ ] Wire into `start-server-runtime.ts` `RuntimeContext` so producers (Phase 2)
      and routes share one instance.

### 1.4 — API (`routes/activities.ts`, registered in `routes/index.ts`)

Owner-guarded (mirror an existing authenticated route's guard):

- [ ] `GET  /api/activities?status=pending|all` → `{ activities, actionRequiredCount }`.
- [ ] `POST /api/activities/:id/archive` → archived record.
- [ ] (Interactive resolves like secret-fill arrive in Phase 2 as their own
      endpoint; generic archive covers info/"mark read" and post-action cleanup.)

## Frontend

### 1.5 — Data layer

- [ ] `lib/api.ts`: `getActivities`, `archiveActivity`.
- [ ] `lib/query-keys.ts`: `activities`.
- [ ] `hooks/use-activities-query.ts`: `useActivitiesQuery()` (poll interval +
      `refetchOnWindowFocus`), `useArchiveActivityMutation()` (optimistic remove + invalidate).

### 1.6 — Nav bell

- [ ] Add a bell button with an action-required count badge to the app nav/header
      (find the existing nav shell component). Click → popover listing recent
      `action_required` cards (reuse `ActivityCard`), with a link to the
      Dashboard thread.
- [ ] Badge hidden when count is 0.

### 1.7 — Dashboard thread shell + generic card

- [ ] `components/activities/ActivityThread.tsx`: query activities, render newest
      cards, `PageStates` for load/error/empty ("You're all caught up").
- [ ] `components/activities/ActivityCard.tsx`: generic shell (icon by kind,
      title, markdown body, relative time, actions slot). A **renderer registry**
      maps `kind → { icon, renderActions }`; this phase ships only a fallback/
      `info` renderer with a single **Mark read** (archive) action. Phase 3 adds
      the per-kind renderers.
- [ ] Render `<ActivityThread/>` in `DashboardPage.tsx`.

## Tests

- `activity-service.test.ts` — emit, dedupe update-in-place, list ordering,
  archive idempotency, action-required count. Temp DB.
- `routes/activities.test.ts` — GET (pending/all + count), archive happy/404,
  owner-guard.
- Migration test (column/table created; existing rows unaffected).
- Frontend: `ActivityThread` renders cards + empty state; nav bell shows/hides
  badge by count; **Mark read** calls archive (optimistic).

## Exit criteria

- A seeded `info` activity appears in the Dashboard thread and the nav badge;
  **Mark read** archives it and the badge decrements.
- `pnpm --filter @cc/backend test` + frontend tests green; lint + typecheck clean.
