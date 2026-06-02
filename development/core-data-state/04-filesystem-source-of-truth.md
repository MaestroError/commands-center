# Filesystem as Source of Truth

**Status:** Planning · **Date:** 2026-06-01

## Goal

Make the workspace **filesystem** the source of truth for portable configuration and
assets. The SQLite database becomes a **disposable cache/index** for those things —
delete it and the app boots as a freshly configured instance with all agents, tools,
skills, settings, custom MCP servers, task templates, and expected secret keys intact
(rehydrated from files). Runtime state, provider/auth connection state, scheduled task
state, chat sessions, and secret _values_ may disappear with the DB.

Two sub-goals:

1. **Move the DB out of the workspace** — `.cc/workspace/database/local.db` →
   `.cc/data/cc.db`.
2. **Persist portable config + assets in files**; keep disposable runtime/auth state
   (and encrypted secret values) in the DB or provider-owned auth stores.

This inverts the old "Portable Workspace Rule" (Postgres primary + dual-write to
SQLite). New model: **files are truth, SQLite is a rebuildable cache.**

---

## Decisions locked in (2026-06-01 review)

- **No data migration.** There are no real users — fresh start, no export/upgrade path.
- **"Sessions" = `conversations` + `messages`** → stays in the disposable DB.
- **Deleting the DB erases task history, task runs, scheduler state, chat history,
  provider connection rows, and secret _values_.** Intended for this phase.
- **Legacy Automations are stale.** The old `automations` / `automation_runs` tables,
  `.cc/workspace/automations` path, placeholder route, stale tests, and related docs
  should be removed in Phase 0 alongside PostgreSQL cleanup. No down migration is
  required because the app has no real users yet.
- **Secret _values_ stay in the DB** (cannot be stored safely in the filesystem).
  A **manifest** file records _which_ secret keys exist (no values), so a fresh
  instance knows what to re-prompt for.
- **Portable JSON config lives under a new `workspace/configuration/` directory**,
  with its paths **guarded in the file manager**. Scope is intentionally small:
  settings, custom MCP servers, task templates, and a secret-key manifest.
- **Providers are not stored in JSON.** They are directly coupled to OpenCode/provider
  auth state. A moved workspace should instead warn when agents/templates reference
  providers/models that are not authenticated in the new instance, and guide the owner
  to authenticate again.
- **Assets are "live": the folder is the truth.** If the folder exists, the asset
  exists; if not, it doesn't. A user can drop/move an asset folder (e.g. an agent)
  into the workspace and it just works. Applies to agents, skills, custom tools.
- **Keep derived DB caches for current entities that still need rows** — after Phase 0
  removes stale Automations, we do not drop useful cache tables just to chase purity.
  Keeping a copy of config in the DB is fine; the only hard rule is that the
  **filesystem is the source of truth** and the DB is **fully rebuildable from it**.
  (`skills` already has no table and stays that way — proof a table isn't _required_,
  not a reason to remove the others.)
- **Two rebuild guarantees** (see §3.1) drive every decision: deleting `cc.db` and
  restarting, or copying the workspace to another machine, must both yield an
  identical portable _configured_ instance — losing only disposable DB/auth state and
  secret values.
- **Today's output is this plan only.** No code changes yet.

---

## 1. Stale infrastructure cleanup (Postgres + legacy Automations)

No working Postgres support exists — it was specced but never implemented:
`db/client.ts:21` throws on `postgres://`; every schema is `sqliteTable`; the `pg`
dep is never imported.

The old Automations feature was replaced by Tasks/Templates scheduling. There is no
active automations UI, route, or service; `/automations` is only a placeholder that
says "Automations are now Tasks." The stale `automations` / `automation_runs` tables
should be dropped from the current schema/migration baseline during this cleanup.

**Postgres code:** remove `pg` dep; remove the postgres guard + `databaseUrl` from
`db/client.ts`; remove `DATABASE_URL` from `runtime-config.ts`, `drizzle.config.ts`,
`test/db/client.test.ts`.

**Legacy Automations code:** remove `packages/backend/src/db/schema/automations.ts`;
remove `automations` / `automation_runs` from the schema barrel and Drizzle snapshots;
remove the `.cc/workspace/automations` runtime path and file-manager critical-path
rule; remove the `/automations` placeholder route and stale UI/docs/tests that refer
to the old Automations screen. Keep the current Tasks scheduling model:
`tasks.scheduled_at`, `task_templates.recurrence_json`, `task_runs`, and
`task_scheduler_state`.

**Migrations:** no down migration/export path is required for this cleanup. There are
no real users yet, so Phase 0 can reset the migration baseline instead of preserving
legacy table history.

**Docs (rewrite, not delete):** `GOAL.md`, `AGENTS.md`, `tech-research.md`,
`README.md`, `CONTRIBUTING.md` — the "Portable Workspace Rule" is currently defined
_as_ Postgres + dual-write; replace with the "files are truth, SQLite is a cache"
model. Also rewrite stale Automations docs to point at Tasks/Templates or delete them
when they describe a removed screen.

---

## 2. `CC_SECRET_KEY` — two responsibilities

Important to know before touching secrets:

1. **Secret encryption** — `secret-service.ts` derives an AES-256-GCM key
   (`sha256(CC_SECRET_KEY)`) to encrypt/decrypt secret values.
2. **Shutdown auth token** — `routes/system.ts:60` requires header
   `x-cc-shutdown-key === config.secretKey` to allow shutdown.

The CLI generates a random 32-byte key into the env file on first run
(`cli/src/cli.ts:261`). Implication: the key is **machine/env-bound, not in the
workspace**. Moving a workspace to a new machine means a new key → existing encrypted
secret values become undecryptable (`readSecretState` → `"stale"`). That's consistent
with "secret values are disposable; re-enter them." The manifest tells you which.

---

## 3. The three buckets

Every piece of state is classified as exactly one of:

- **(A) DB/auth-only (disposable)** — runtime history, scheduled task state,
  provider/auth connection state, and encrypted secret values. Lost on DB delete or
  machine move, by design.
- **(B) Configuration files** — CC-managed structured config under
  `workspace/configuration/`. File-manager-guarded. Scope: settings, custom MCP
  servers, task templates, and the secret-key manifest.
- **(C) Live workspace assets** — the folder _is_ the asset. Scanned from disk; exists
  iff the folder exists.

### Classification of current tables + assets (after Phase 0 cleanup)

| State                                         | Bucket | Where                                    | DB table?                          |
| --------------------------------------------- | ------ | ---------------------------------------- | ---------------------------------- |
| `tasks`                                       | A      | DB                                       | yes (disposable)                   |
| `task_runs`                                   | A      | DB                                       | yes (disposable)                   |
| `task_subtasks`                               | A      | DB                                       | yes (disposable)                   |
| `task_feedback`                               | A      | DB                                       | yes (disposable)                   |
| `task_scheduler_state`                        | A      | DB                                       | yes (disposable)                   |
| `conversations`                               | A      | DB                                       | yes (disposable)                   |
| `messages`                                    | A      | DB                                       | yes (disposable)                   |
| `providers` / provider auth state             | A      | DB + OpenCode/provider auth stores       | yes (disposable warning source)    |
| **secret values** (`secrets.encrypted_value`) | A      | DB                                       | yes (disposable)                   |
| **secret manifest** (which keys exist)        | B      | `configuration/secrets.json`             | no                                 |
| `settings`                                    | B      | `configuration/settings.json`            | derived cache                      |
| `mcp_servers`                                 | B      | `configuration/mcp.json`                 | derived cache                      |
| `task_templates`                              | B      | `configuration/task-templates/<id>.json` | derived cache                      |
| `agents`                                      | C      | `agents/<slug>/`                         | derived cache                      |
| skills                                        | C      | `skills/<slug>/`                         | none today — keep as-is ✅         |
| custom tools                                  | C      | `custom-tools/<slug>/`                   | derived cache (already disk-truth) |

### Uniform rule: file = truth, table = derived cache

Every bucket-B/C entity that has a table after Phase 0 **keeps** it, but the table is
**derived** — rebuilt from files on boot, never authoritative. We do _not_ drop current
cache tables just to chase purity: keeping a DB copy is harmless and avoids rewriting
the relational joins and FK constraints the disposable tables depend on:

- `agents.id` ← `tasks`, `task_runs`, `task_subtasks`, `conversations`,
  `task_templates`. **5 references.**
- `task_templates.id` ← `tasks`.

`custom_tools` already works this way (`syncGlobalToolRows`). `skills` has no table
and stays tableless — it proves a table isn't _required_, but we won't remove the
others just to chase purity. The single invariant: **the file wins; the row is a
projection of it.**

Provider rows are intentionally excluded from file truth. Instead of persisting
provider connections, the app should detect provider/model references in agents,
custom MCPs, and task templates, compare them with the authenticated provider state in
the current instance, and warn the owner about anything that needs re-authentication.

### 3.1 Rebuild guarantees (acceptance criteria)

These are the two scenarios the whole effort must satisfy — and the basis for the
Phase 4 e2e test:

1. **Delete `cc.db` + restart.** App boots, reconciles all derived caches from files,
   and is the functionally identical portable _configured_ instance: same agents,
   tools, skills, settings, custom MCP servers, task templates, and the same set of
   expected secret keys. **Lost:** task history, task runs, scheduler state, chat
   sessions, provider connection rows, and secret _values_ (must be re-entered,
   prompted via the manifest).
2. **Copy/move the workspace to another machine + run `cc`.** Same configured
   instance as above. Additionally, provider auth and secret values must be re-entered
   on that machine. The UI should warn for referenced-but-unauthenticated providers and
   missing secret values — see §2.

Nothing in bucket B or C may be reachable _only_ from the DB; if it can't be rebuilt
from files, it's a bug.

---

## 4. Workspace layout (target)

```
.cc/
  data/                          # OUTSIDE workspace — disposable
    cc.db
  workspace/
    configuration/               # bucket B — CC-managed, file-manager-guarded
      settings.json
      mcp.json
      secrets.json               # manifest: keys + metadata, NO values
      task-templates/<id>.json
    agents/<slug>/               # bucket C — live asset (folder = truth)
    skills/<slug>/               # bucket C — live (already)
    custom-tools/<slug>/         # bucket C — live (already disk-truth)
    sessions/                    # runtime session files (unchanged)
    auth/                        # owner-access + provider/mcp auth state (unchanged)
    task-context-attachments/    # runtime (unchanged)
    tmp/                         # scratch (unchanged)
    opencode.jsonc               # rendered workspace config (unchanged)
```

Notes:

- `configuration/` is **additive** — it holds the config that is DB-only today.
  Existing asset dirs (`agents/`, `skills/`, `custom-tools/`) and runtime dirs
  (`sessions/`, `auth/`, `task-context-attachments/`, `tmp/`) stay where they are.
- **`configuration/mcp.json` is the source; the existing `mcp/` dir is the
  _rendered_ OpenCode MCP config** (written by `syncGlobalConfig`). Keep them
  distinct — file-truth lives in `configuration/`, the OpenCode render stays in `mcp/`.
  Same idea for agents: `agents/<slug>/agent.json` is source, `opencode.jsonc` /
  `AGENTS.md` inside the folder are renders.
- `auth/` already holds sensitive OAuth/MCP tokens on disk today (managed by
  OpenCode + owner-access-service). Out of scope to change; flagged for awareness.
- `preferences/` (file-manager UI prefs) can fold into `configuration/` or stay —
  minor, decide during implementation.

### JSON config file rules

All bucket-B JSON files follow the same safety rules:

- Read through Zod schemas at the filesystem boundary. Invalid files should not crash
  boot; log a clear validation error and surface a repair warning in the UI.
- Missing files mean defaults, then the next app write materializes the file.
- Include a `version` field in each file shape so later migrations are explicit.
- Write atomically: write a sibling temp file, `fsync`/close it, then rename over the
  target. Never leave partially written JSON as the source of truth.
- Keep secret values out of JSON. `configuration/secrets.json` is only a manifest of
  expected keys and metadata.

---

## 5. The "live asset" model (bucket C)

Assets are reconciled from disk. The pattern (already proven by `custom_tools` and
`skills`):

- **Existence = folder presence.** Scan the asset root; each subfolder is one asset.
- **Optional metadata file** inside the folder carries fields that can't be inferred
  from the folder name. Missing file → sensible defaults derived from the folder.
- **Stable id:** the metadata file stores a ULID `id` so references survive reboots
  and machine moves. If a hand-dropped folder has no metadata file, the first scan
  **generates** the id and writes the file.

### Agents specifically

- Folder name = **slug** (`agents/<slug>/`).
- `agent.json` is a **CC sidecar**, not a requirement. It improves fidelity for
  CC-native agents but must not be required for discovery.
- The scanner supports multiple layouts, in this order:
  1. **CC-native:** `agent.json` plus rendered `AGENTS.md` / `opencode.jsonc`.
  2. **OpenCode-style:** infer identity and model/provider references from
     `opencode.jsonc`, `AGENTS.md`, and other recognizable OpenCode workspace files.
  3. **Claude Code-style:** infer identity and instructions from recognizable Claude
     Code files (for example `CLAUDE.md`) when present.
  4. **Plain folder:** any directory under `agents/<slug>/` becomes a usable agent
     with defaults derived from the folder name and any obvious instruction file.
- `agent.json` (when present or generated) holds: `id` (ULID), display `name`, `role`,
  `avatar`/emoji, `default_model`, `capabilities`, `status`, timestamps, and optional
  provider/model/secret requirements inferred during import.
- **All of name/role/avatar are optional.** If a user just creates or drops a folder:
  - `name` defaults to the folder name (slug),
  - `role` and `avatar` default to empty,
  - `id` is generated and written into a new `agent.json` on first scan when possible,
  - the agent becomes fully usable.
- If writing `agent.json` fails (for example read-only workspace), keep the discovered
  agent usable for the current boot with an in-memory generated id and surface a warning
  that stable identity cannot be persisted until the folder is writable.
- Instructions/skills/MCP are **already** rendered into the OpenCode workspace files
  by `writeOpenCodeWorkspace`. Keep that as the _render_; `agent.json` (+ the folder)
  is the _source_. Avoid duplicating instructions in two canonical places.
- The `agents` **cache table** is rebuilt from this scan (needed for the 6 FK refs);
  it is never authoritative.

### Reconcile mechanism

- **On boot:** scan asset roots + read configuration files, then upsert **every**
  derived cache table — deleting rows whose source file/folder is gone (same as
  `syncGlobalToolRows` does today). Order (independent ones first, then the FK
  targets): `settings → mcp_servers → custom_tools → agents → task_templates`.
- **Write-through:** API writes update the file first, then the cache row.
- **No filesystem watching** (explicitly out of scope). Folders dropped in _between_
  boots are picked up on next boot/scan; that's acceptable. (A manual "rescan" action
  could be added later if desired.)
- **Provider/auth warnings:** after reconcile, inspect discovered agents, custom MCPs,
  and task templates for provider/model/secret requirements. Warn when a referenced
  provider is not authenticated or a required secret key has no value.

Wire the boot reconcile into `lib/start-server-runtime.ts:108`, right after
`migrateDatabase`, before services are constructed.

---

## 6. Secrets

- **Values:** stay in the DB `secrets` table (encrypted, disposable). Unchanged
  encryption via `CC_SECRET_KEY`.
- **Manifest:** `configuration/secrets.json` records the set of keys + metadata
  (`createdAt`/`updatedAt`, maybe which agent/provider expects them) — **never the
  value**. Written on `set`/`ensure`/`delete`.
- **On fresh DB:** the manifest seeds the expected key list (via the existing
  `ensure`/`listMissing` flow) so the UI prompts the owner to re-enter values. No
  values are recoverable — by design.

---

## 7. File-manager guarding

`CRITICAL_WORKSPACE_PATH_RULES` (`file-manager-service.ts:65`) flags paths as
`isCritical` with a reason (warns on destructive ops). Changes:

- **Remove** the `database` rule (line 67) — the DB leaves the workspace.
- **Remove** the `automations` rule — the legacy `.cc/workspace/automations` path is
  deleted in Phase 0.
- **Add** a recursive rule for `configuration/` — "CommandsCenter configuration
  managed by the app."
- Existing rules (`preferences`, `auth`, `mcp`, `sessions`, `tools`, `agents`,
  `agents/.archived`, `opencode.jsonc`) **stay** — those dirs are not moving.

Confirm `configuration/` is reachable/guarded through whatever file-manager root
exposes the workspace, and that the new asset/config paths can't be traversed outside
their roots (sanitize logic already exists). Critical paths are _flagged with a
warning_, not hard-blocked — confirm that's the intended protection level for
`configuration/` (it deliberately stays editable so power users can hand-edit config).

---

## 8. Move the DB out of the workspace

- Add `dataDir` to `RuntimeConfig.paths` (default `<cwd>/.cc/data`, override
  `CC_DATA_DIR`); `sqlitePath = <dataDir>/cc.db`.
- Remove `database` from `paths.subdirectories`; drop `databaseFile`.
- Update `drizzle.config.ts` (dev `db:generate`/`db:migrate`).
- `createDatabaseClient` already `mkdirSync`s the parent — works once the path moves.
- No relocation shim needed (no real users / no migration).

---

## 9. Service-level impact (per entity, Phase 3 work)

All config/asset services move to **write-through, file-first** (write the file, then
upsert the derived row) and gain a **reconcile-from-files** path used at boot.

| Service / area                                          | Change                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `secret-service.ts`                                     | keep DB for values; write/read `configuration/secrets.json` manifest on set/ensure/delete                                  |
| settings (`db/helpers.ts` `getSetting`/`upsertSetting`) | file-first to `configuration/settings.json`; row = derived cache                                                           |
| `mcp-server-service.ts`                                 | file-first to `configuration/mcp.json`; keep OpenCode-config render in `mcp/`; row = derived cache                         |
| task-templates (part of task-service)                   | file-first to `configuration/task-templates/`; row = derived cache                                                         |
| `agent-service.ts`                                      | folder-scan = truth; discover CC/OpenCode/Claude/plain folders; optional `agent.json`; `agents` row = derived cache        |
| `provider-service.ts`                                   | no JSON source. Keep as current-instance/auth state; add warnings for referenced providers/models that need authentication |
| `custom-tool-service.ts`                                | already disk-truth via `syncGlobalToolRows` — keep                                                                         |
| workspace-skill-service                                 | already folder-truth, tableless — no change                                                                                |

---

## 10. Risks & open considerations

- **`CC_SECRET_KEY` portability** (§2): moving a workspace to a new machine yields a
  new key → encrypted secret values become stale. Document the re-enter flow; manifest
  drives it.
- **Provider portability:** provider auth is intentionally not portable. The scanner
  must infer provider/model requirements from portable assets/config and warn clearly
  when the current instance has not authenticated what those assets need.
- **JSON corruption/partial writes:** bucket-B files are source-of-truth, so all reads
  must use Zod validation and all writes must be atomic.
- **Bare-folder id generation:** writing `agent.json` on first scan mutates the
  workspace at read time. Acceptable, but the scan must be idempotent and safe under a
  read-only workspace (degrade to in-memory id if write fails).
- **Slug/folder rename:** renaming an agent folder changes its slug; the `id` in
  `agent.json` keeps identity stable, but any DB rows keyed by the _old_ derived row
  get reconciled. Since runtime history is disposable this is low-stakes, but worth a
  test.
- **No watching:** folders added between boots need a reboot/rescan. Acceptable per
  decision; consider a manual rescan endpoint later.
- **Orphaned OpenCode session data:** `conversations` maps `opencode_session_id` →
  conversation. Wiping the DB loses that mapping, but OpenCode's own session files on
  disk may remain (orphaned). Harmless to "fresh but configured," but the reconcile
  should not try to resurrect chat history from them — chat history is disposable.
  Decide whether to also prune stale session files on boot (optional housekeeping).
- **Tests:** add (a) live-asset scan/reconcile unit tests, (b) CC/OpenCode/Claude/plain
  folder → usable agent tests, (c) JSON validation + atomic-write tests, (d) provider
  warning tests, (e) "delete `cc.db`, reboot" e2e asserting portable config/assets are
  identical and history/auth state is empty or prompts for re-entry.

---

## 11. Phasing

| Phase  | Scope                                                                                                                  | Risk   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| **0**  | Drop stale infrastructure: Postgres stub + legacy Automations tables/schema/path/placeholder/docs/tests                | low    |
| **1**  | Move DB to `.cc/data/`                                                                                                 | low    |
| **2**  | `configuration/` dir + file-manager guarding + the reconcile/write-through framework (generalize `syncGlobalToolRows`) | medium |
| **3a** | Flat config files → file-first + derived cache: `settings`, `mcp_servers`, secrets manifest + JSON safety helpers      | medium |
| **3b** | Per-record config → file-first + derived cache: `task_templates`                                                       | medium |
| **3c** | Live agent folders: CC/OpenCode/Claude/plain discovery, optional `agent.json`, defaults + id generation, cache rebuild | high   |
| **4**  | Rebuild-guarantee e2e (§3.1: delete `cc.db` + reboot; copy workspace) + finalize Portable Workspace docs               | low    |

Phases 0–1 are independent and shippable immediately. Phase 2 unlocks 3a–3c, which can
land one entity at a time, each with its own round-trip test.

---

## Key source references

- Postgres guard: `packages/backend/src/db/client.ts:21`
- Paths / DB location: `packages/backend/src/lib/runtime-config.ts:246`
- `CC_SECRET_KEY` uses: `services/secret-service.ts`, `routes/system.ts:60`, `cli/src/cli.ts:261`
- Boot sequence: `packages/backend/src/lib/start-server-runtime.ts:107`
- File-manager guarding: `services/file-manager-service.ts:65`
- Reference live-asset patterns: `services/custom-tool-service.ts:816` (`syncGlobalToolRows`), `services/workspace-skill-service.ts`
- Stale legacy Automations: `db/schema/automations.ts`, `frontend/src/app/routes.tsx:118`
- Schemas: `packages/backend/src/db/schema/`
