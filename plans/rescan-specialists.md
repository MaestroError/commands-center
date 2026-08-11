# Import newly added specialist folders without restarting CommandsCenter

## Goal

Add a secondary **Rescan specialists** action to the All Specialists page so an
operator can copy a specialist folder into the active workspace and import it
without restarting the CommandsCenter service.

The first version is deliberately import-only. It discovers new specialist
folders but does not update, archive, or delete specialists that are already
registered.

## Current behavior

`specialistReconciler` scans `specialists/` and `specialists/.archived/` only
during backend startup. It accepts these folder shapes:

- a CC-native folder containing a valid `specialist.json`;
- an OpenCode-style folder containing `AGENTS.md` and optionally
  `opencode.jsonc` for the model;
- a Claude-style folder containing `CLAUDE.md`;
- a plain folder, which receives placeholder specialist metadata.

The boot reconciler then upserts every discovered specialist and deletes
derived database rows whose source folder is gone. Startup subsequently runs
the CC-managed MCP workspace sync. The Settings-page **Restart instance**
button restarts only the OpenCode engine, so it does not rerun this startup
sequence.

## Scope and safety decisions

- Scan only direct, non-hidden child directories of the active
  `CC_WORKSPACE_DIR/specialists/` root. Do not import `.archived/` folders from
  this manual action.
- Import only folders that do not already represent a registered specialist.
- Treat a folder as already registered when its valid `specialist.json` ID is
  already present, or when its folder slug is already present with the same
  identity.
- Report ID/slug collisions as conflicts. Never overwrite either specialist.
- If `specialist.json` exists but is invalid JSON or fails schema validation,
  report the folder as invalid and preserve the file byte-for-byte. Do not
  silently infer metadata and replace it.
- Do not modify an existing specialist even when its `specialist.json` differs
  from the runtime cache. External bulk updates are a separate feature with a
  different review and conflict model.
- Do not archive or delete a specialist because its folder is missing. The
  existing boot reconciler keeps its current startup semantics.
- Ignore hidden directories and non-directory entries. These are not failures.
- Serialize rescans in the backend so concurrent clicks or browser tabs cannot
  import the same folder twice.
- Process folders independently: one invalid folder must not prevent other new
  folders from importing.
- Do not add a filesystem watcher. Import remains an explicit operator action.
- Do not introduce new dependencies or persistence formats.

## MCP, skills, tools, and document behavior

- After inserting a new specialist, run the existing CC-managed MCP workspace
  synchronization for that specialist. This supplies current CommandsCenter
  MCP endpoints and auth headers without restarting the OpenCode engine.
- Scope that sync to newly imported specialist IDs so a rescan does not rewrite
  unrelated specialist workspaces.
- Preserve capability selections from a valid CC-native `specialist.json`.
  OpenCode/Claude/plain inferred folders start with empty CC capability arrays,
  matching the current importer, and can be configured in the specialist
  editor afterward.
- Do not auto-assign global MCP servers, built-in/workspace skills, or global
  custom tools to inferred folders. Specialist-local files already inside the
  copied folder remain on disk.
- The generated CC workspace configuration follows the same workspace contract
  as a startup import. An arbitrary external `opencode.jsonc` is used only for
  its model hint unless the configuration is represented by CC's portable
  `specialist.json` capabilities.
- No OpenCode engine restart is required. A newly imported workspace has no CC
  conversation instance to invalidate; its first chat opens it with the synced
  configuration.
- Private Documents indexing and task-template reconciliation are out of scope
  for this specialist-directory action. The specialist's files remain present,
  but this button does not become a general full-workspace reconciler. Add
  focused follow-up import flows if those portable resources need live import.

## Implementation plan

1. Extract a safe manual-import operation from specialist folder discovery.
   - Reuse the existing folder-name filtering and AGENTS/Claude/plain metadata
     inference rather than duplicating supported formats.
   - Separate “missing `specialist.json`” from “present but invalid” so the
     manual path never overwrites malformed source metadata.
   - Add an import-only service function that snapshots registered IDs/slugs,
     classifies every folder, writes generated `specialist.json` files for
     inferable new folders, and inserts the derived `agents` rows.
   - Preserve the boot reconciler's behavior by composing it from shared
     discovery helpers without changing its delete-missing-row contract.
   - Guard the operation with a single in-process promise/mutex and use database
     uniqueness constraints as the final collision backstop.
   - Verify: rescanning a folder once imports it; rescanning again reports it as
     already registered and creates no additional row or file changes.

2. Define a typed rescan response contract in `@cc/shared`.
   - Add a response schema containing imported specialist summaries,
     already-registered folder slugs, and per-folder failures.
   - Give failures stable reason codes such as `invalid_metadata`,
     `id_conflict`, `slug_conflict`, and `io_error`, plus a safe user-facing
     message.
   - Derive display counts from the returned arrays rather than maintaining a
     second set of counters.
   - Do not expose absolute server filesystem paths or raw unexpected error
     details in the API response.
   - Verify: the route response is parsed by the shared schema on both backend
     and frontend boundaries.

3. Add an owner-authenticated manual rescan endpoint.
   - Add `POST /api/specialists/rescan` in the specialist route domain.
   - Run the import-only operation, then scope
     `syncCcManagedMcpSpecialistWorkspaces` to the newly imported IDs.
   - Return `200` with the complete classification result, including a valid
     no-op result when no folders are new.
   - Keep unexpected request-level failures on the standard Fastify error path;
     expected per-folder problems remain successful result entries so partial
     imports are visible.
   - Verify: imported specialists are immediately returned by
     `GET /api/specialists` without restarting either CommandsCenter or
     OpenCode.

4. Add the frontend API mutation and cache refresh.
   - Add a typed `rescanSpecialists` API client.
   - Extend the specialist mutation hook with a rescan mutation.
   - On success, invalidate the specialists list and specialist catalog, plus
     the same dependent specialist/custom-tool/workspace-skill query families
     invalidated by specialist creation.
   - Do not optimistically synthesize imported specialists; use the canonical
     list returned after backend import and MCP synchronization.
   - Verify: the All Specialists page renders imported cards immediately after
     a successful response without a browser reload.

5. Add the secondary action and accessible result feedback.
   - Place **Rescan specialists** beside **Create specialist** in the existing
     `PageHeader` actions, using the CC-owned `Button` with
     `variant="secondary"`.
   - Disable it while pending and label the pending state **Rescanning…**.
   - Render an accessible inline success summary below the header, for example
     “Imported 2 specialists; 3 were already registered.”
   - Render partial failures in an accessible error/warning surface with folder
     names and safe reasons while retaining the successful import summary.
   - A no-op scan should say “No new specialist folders found.”
   - Do not add a confirmation dialog because the operation is additive and
     non-destructive.
   - Follow the CC design system: existing primitives, semantic theme roles,
     responsive wrapping, and no new CSS compatibility classes.
   - Verify: keyboard activation, pending state, narrow layout, success,
     no-op, partial-failure, and retry behavior all work.

6. Document the live import workflow.
   - Update the specialist/workspace documentation or README section that
     describes folder-based importing.
   - State the accepted folder layouts, active workspace location, import-only
     semantics, capability behavior, and the fact that `specialist.json` is the
     complete portable CC format.
   - Clarify that the Settings action restarts the OpenCode engine and is not
     required for specialist import.
   - Verify: an operator can copy a folder and complete the import using only
     the UI instructions.

7. Run required quality and regression checks.
   - Run ESLint with `--fix` for touched files, followed by the repository lint
     command.
   - Run focused shared, backend, and frontend Vitest suites while iterating.
   - Run `pnpm typecheck`, `pnpm test`, and the relevant Specialists Playwright
     flow.
   - Run `pnpm design-system:audit` because the Specialists page action and
     feedback surface change.

## Test matrix

### Backend service and route tests

- Imports a valid CC-native folder while preserving its ID, metadata, and
  capabilities.
- Imports an OpenCode-style folder and reads the supported model hint.
- Imports a Claude-style folder.
- Imports a plain folder with the established placeholder metadata.
- Writes one stable `specialist.json` for an inferred folder.
- Reports an imported folder as already registered on the next rescan without
  changing its file timestamp or database row.
- Leaves an already-registered specialist unchanged when its on-disk metadata
  differs.
- Reports invalid `specialist.json` without overwriting it or falling back to
  inferred metadata.
- Reports duplicate IDs and duplicate slugs as conflicts without changing
  either existing or copied source.
- Ignores hidden folders and non-directory entries.
- Imports valid folders when another folder fails.
- Serializes concurrent rescan requests and inserts each specialist once.
- Never deletes or archives a row whose folder is absent.
- Adds current CC-managed MCP entries for each imported specialist and does not
  rewrite unrelated workspaces.
- Makes imported specialists immediately visible from the list endpoint.
- Does not leak absolute paths or unexpected error details in per-folder
  responses.

### Frontend tests

- Shows **Rescan specialists** as the secondary PageHeader action beside the
  primary create action.
- Calls the rescan endpoint once, disables the action while pending, and
  prevents duplicate submission.
- Invalidates the required query families after success.
- Renders imported specialist cards after refetch without a page reload.
- Shows accurate imported and already-registered counts with correct singular
  and plural wording.
- Shows the no-new-folders result.
- Shows partial failures without hiding successful imports and allows retry.
- Shows a request-level error and allows retry.
- Keeps both PageHeader actions usable and contained at narrow widths.

### End-to-end flow

- Seed/copy an OpenCode-style specialist folder into the active workspace after
  CommandsCenter is already running.
- Open All Specialists, select **Rescan specialists**, and observe the imported
  card without restarting the service or reloading the browser.
- Open the imported specialist and verify its name, role, instructions, and
  model.
- Start its first chat and verify the workspace uses synchronized CC-managed
  MCP configuration.
- Rescan again and verify the no-new-specialists/already-registered result with
  no duplicate card.

## Expected touch points

- `packages/shared/src/schemas/specialists.ts`
- `packages/backend/src/services/specialist-file.ts`, or a focused sibling
  import service if separation keeps the boot reconciler clearer
- `packages/backend/src/mcp/cc-managed/workspace-sync-service.ts`
- `packages/backend/src/routes/specialists.ts`
- Mirrored backend service and route tests
- `packages/frontend/src/lib/api/specialists.ts`
- `packages/frontend/src/hooks/use-specialists-query.ts`
- `packages/frontend/src/pages/SpecialistsPage.tsx`
- Matching frontend API, hook, and page tests
- `packages/frontend/e2e/` specialist flow coverage
- README or specialist workspace documentation

## Acceptance criteria

- A new folder copied directly into the active `specialists/` directory can be
  imported from All Specialists without restarting CommandsCenter.
- Manual rescan never edits, archives, or deletes an already-registered
  specialist.
- Invalid metadata and identity collisions are visible and non-destructive.
- Imported specialists receive valid CC-managed MCP workspace configuration
  and can open a first chat without an engine restart.
- The UI clearly distinguishes imported, already registered, no-op, and failed
  outcomes.
- Repeated and concurrent rescans are idempotent.
- Portable workspace files remain the source of truth, with SQLite used only as
  the derived runtime cache.
- Required lint, typecheck, unit/integration, design-system, and end-to-end
  checks pass.
