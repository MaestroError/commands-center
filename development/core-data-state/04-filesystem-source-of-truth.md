# Filesystem as Source of Truth

**Status:** Planning · **Date:** 2026-06-01

## Goal

Make the workspace **filesystem** the source of truth for configuration and assets.
The SQLite database becomes a **disposable cache** — delete it and the app boots as a
freshly configured instance with all agents, tools, skills, providers, settings, MCP
servers, automations, and task templates intact (rehydrated from files). Only
_runtime history_ (tasks, task runs, chat sessions) and _secret values_ are allowed to
disappear with the DB.

Two sub-goals:

1. **Move the DB out of the workspace** — `.cc/workspace/database/local.db` →
   `.cc/data/cc.db`.
2. **Persist config + assets in files**; keep only disposable runtime data (and
   encrypted secret values) in the DB.

This inverts the old "Portable Workspace Rule" (Postgres primary + dual-write to
SQLite). New model: **files are truth, SQLite is a rebuildable cache.**

---

## Decisions locked in (2026-06-01 review)

- **No data migration.** There are no real users — fresh start, no export/upgrade path.
- **"Sessions" = `conversations` + `messages`** → stays in the disposable DB.
- **Deleting the DB erases task history, task runs, chat history, and secret
  _values_.** Intended.
- **Secret _values_ stay in the DB** (cannot be stored safely in the filesystem).
  A **manifest** file records _which_ secret keys exist (no values), so a fresh
  instance knows what to re-prompt for.
- **Config lives under a new `workspace/configuration/` directory**, organized as we
  see fit, with its paths **guarded in the file manager**.
- **Assets are "live": the folder is the truth.** If the folder exists, the asset
  exists; if not, it doesn't. A user can drop/move an asset folder (e.g. an agent)
  into the workspace and it just works. Applies to agents, skills, custom tools.
- **Keep derived DB caches for everything that has a table today** — no tables are
  dropped. Keeping a copy of config in the DB is fine; the only hard rule is that the
  **filesystem is the source of truth** and the DB is **fully rebuildable from it**.
  (`skills` already has no table and stays that way — proof a table isn't _required_,
  not a reason to remove the others.)
- **Two rebuild guarantees** (see §3.1) drive every decision: deleting `cc.db` and
  restarting, or copying the workspace to another machine, must both yield an
  identical _configured_ instance — losing only history, tasks, and secret values.
- **Today's output is this plan only.** No code changes yet.

---

## 1. Postgres removal (cleanup, no behavioral risk)

No working Postgres support exists — it was specced but never implemented:
`db/client.ts:21` throws on `postgres://`; every schema is `sqliteTable`; the `pg`
dep is never imported.

**Code:** remove `pg` dep; remove the postgres guard + `databaseUrl` from
`db/client.ts`; remove `DATABASE_URL` from `runtime-config.ts`, `drizzle.config.ts`,
`test/db/client.test.ts`.

**Docs (rewrite, not delete):** `GOAL.md`, `AGENTS.md`, `tech-research.md`,
`README.md`, `CONTRIBUTING.md` — the "Portable Workspace Rule" is currently defined
_as_ Postgres + dual-write; replace with the "files are truth, SQLite is a cache"
model.

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

- **(A) DB-only (disposable)** — runtime history + encrypted secret values. Lost on DB
  delete, by design.
- **(B) Configuration files** — CC-managed structured config under
  `workspace/configuration/`. File-manager-guarded.
- **(C) Live workspace assets** — the folder _is_ the asset. Scanned from disk; exists
  iff the folder exists.

### Classification of all 13 tables + assets

| State                                         | Bucket | Where                                    | DB table?                          |
| --------------------------------------------- | ------ | ---------------------------------------- | ---------------------------------- |
| `tasks`                                       | A      | DB                                       | yes (disposable)                   |
| `task_runs`                                   | A      | DB                                       | yes (disposable)                   |
| `task_subtasks`                               | A      | DB                                       | yes (disposable)                   |
| `task_feedback`                               | A      | DB                                       | yes (disposable)                   |
| `task_scheduler_state`                        | A      | DB                                       | yes (disposable)                   |
| `conversations`                               | A      | DB                                       | yes (disposable)                   |
| `messages`                                    | A      | DB                                       | yes (disposable)                   |
| `automation_runs`                             | A      | DB                                       | yes (disposable)                   |
| **secret values** (`secrets.encrypted_value`) | A      | DB                                       | yes (disposable)                   |
| **secret manifest** (which keys exist)        | B      | `configuration/secrets.json`             | no                                 |
| `settings`                                    | B      | `configuration/settings.json`            | derived cache                      |
| `providers`                                   | B      | `configuration/providers.json`           | derived cache                      |
| `mcp_servers`                                 | B      | `configuration/mcp.json`                 | derived cache                      |
| `automations`                                 | B      | `configuration/automations/<id>.json`    | derived cache                      |
| `task_templates`                              | B      | `configuration/task-templates/<id>.json` | derived cache                      |
| `agents`                                      | C      | `agents/<slug>/`                         | derived cache                      |
| skills                                        | C      | `skills/<slug>/`                         | none today — keep as-is ✅         |
| custom tools                                  | C      | `custom-tools/<slug>/`                   | derived cache (already disk-truth) |

### Uniform rule: file = truth, table = derived cache

Every bucket-B/C entity that has a table today **keeps** it, but the table is
**derived** — rebuilt from files on boot, never authoritative. We do _not_ drop tables:
keeping a DB copy is harmless and avoids rewriting the relational joins and FK
constraints the disposable tables depend on:

- `agents.id` ← `tasks`, `task_runs`, `task_subtasks`, `conversations`,
  `automations`, `task_templates`. **6 references.**
- `task_templates.id` ← `tasks`.
- `automations.id` ← `automation_runs`.

`custom_tools` already works this way (`syncGlobalToolRows`). `skills` has no table
and stays tableless — it proves a table isn't _required_, but we won't remove the
others just to chase purity. The single invariant: **the file wins; the row is a
projection of it.**

### 3.1 Rebuild guarantees (acceptance criteria)

These are the two scenarios the whole effort must satisfy — and the basis for the
Phase 4 e2e test:

1. **Delete `cc.db` + restart.** App boots, reconciles all derived caches from files,
   and is the functionally identical _configured_ instance: same agents, tools, skills,
   providers, settings, MCP servers, automations, task templates, and the same set of
   expected secret keys. **Lost:** task history, task runs, chat sessions, and secret
   _values_ (must be re-entered, prompted via the manifest).
2. **Copy/move the workspace to another machine + run `cc`.** Same configured
   instance as above. Additionally, secret values are unreadable there (new
   `CC_SECRET_KEY`) and must be re-entered — see §2.

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
      providers.json
      mcp.json
      secrets.json               # manifest: keys + metadata, NO values
      automations/<id>.json
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
- `agent.json` (optional) holds: `id` (ULID), display `name`, `role`, `avatar`/emoji,
  `default_model`, `capabilities`, `status`, timestamps.
- **All of name/role/avatar are optional.** If a user just creates a folder:
  - `name` defaults to the folder name (slug),
  - `role` and `avatar` default to empty,
  - `id` is generated and written into a new `agent.json` on first scan,
  - the agent becomes fully usable.
- Instructions/skills/MCP are **already** rendered into the OpenCode workspace files
  by `writeOpenCodeWorkspace`. Keep that as the _render_; `agent.json` (+ the folder)
  is the _source_. Avoid duplicating instructions in two canonical places.
- The `agents` **cache table** is rebuilt from this scan (needed for the 6 FK refs);
  it is never authoritative.

### Reconcile mechanism

- **On boot:** scan asset roots + read configuration files, then upsert **every**
  derived cache table — deleting rows whose source file/folder is gone (same as
  `syncGlobalToolRows` does today). Order (independent ones first, then the FK
  targets): `settings → providers → mcp_servers → custom_tools → agents →
automations → task_templates`.
- **Write-through:** API writes update the file first, then the cache row.
- **No filesystem watching** (explicitly out of scope). Folders dropped in _between_
  boots are picked up on next boot/scan; that's acceptable. (A manual "rescan" action
  could be added later if desired.)

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
- **Add** a recursive rule for `configuration/` — "CommandsCenter configuration
  managed by the app."
- Existing rules (`preferences`, `auth`, `mcp`, `sessions`, `automations`, `tools`,
  `agents`, `agents/.archived`, `opencode.jsonc`) **stay** — those dirs are not moving.
  Note `automations` here refers to the existing subdir; the new
  `configuration/automations/` files are covered by the `configuration/` rule.

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

| Service                                                 | Change                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `secret-service.ts`                                     | keep DB for values; write/read `configuration/secrets.json` manifest on set/ensure/delete                       |
| `provider-service.ts`                                   | file-first to `configuration/providers.json`; row = derived cache                                               |
| settings (`db/helpers.ts` `getSetting`/`upsertSetting`) | file-first to `configuration/settings.json`; row = derived cache                                                |
| `mcp-server-service.ts`                                 | file-first to `configuration/mcp.json`; keep OpenCode-config render in `mcp/`; row = derived cache              |
| `agent-service.ts`                                      | folder-scan = truth; `agent.json` metadata; generate id/defaults for bare folders; `agents` row = derived cache |
| automations service                                     | file-first to `configuration/automations/`; row = derived cache                                                 |
| task-templates (part of task-service)                   | file-first to `configuration/task-templates/`; row = derived cache                                              |
| `custom-tool-service.ts`                                | already disk-truth via `syncGlobalToolRows` — keep; just relocate root if needed                                |
| workspace-skill-service                                 | already folder-truth, tableless — no change                                                                     |

---

## 10. Risks & open considerations

- **`CC_SECRET_KEY` portability** (§2): moving a workspace to a new machine yields a
  new key → encrypted secret values become stale. Document the re-enter flow; manifest
  drives it.
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
- **Tests:** add (a) live-asset scan/reconcile unit tests, (b) bare-folder → usable
  agent test, (c) "delete `cc.db`, reboot" e2e asserting config/assets identical and
  history empty.

---

## 11. Phasing

| Phase  | Scope                                                                                                                  | Risk   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| **0**  | Drop Postgres (code + docs)                                                                                            | low    |
| **1**  | Move DB to `.cc/data/`                                                                                                 | low    |
| **2**  | `configuration/` dir + file-manager guarding + the reconcile/write-through framework (generalize `syncGlobalToolRows`) | medium |
| **3a** | Flat config files → file-first + derived cache: `settings`, `providers`, `mcp_servers`, secrets manifest               | medium |
| **3b** | Per-record config → file-first + derived cache: `automations`, `task_templates`                                        | medium |
| **3c** | Live agent folders: `agent.json`, bare-folder support (defaults + id generation), `agents` derived cache               | high   |
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
- Schemas: `packages/backend/src/db/schema/`
