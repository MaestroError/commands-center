# CC_OPENCODE_STATE_DIR: persist OpenCode global state

## Problem

The managed `opencode serve` child stores its global state under XDG paths derived
from `$HOME` (`~/.local/share/opencode` for `auth.json`, `mcp-auth.json`,
`opencode.db`, and session storage; `~/.config/opencode` for global config;
`~/.cache/opencode` for caches). In Docker, `HOME=/home/node` is not on the
`/workspace` volume, so provider connections and OpenCode sessions are lost on
every container rebuild.

## Assumptions

- OpenCode resolves `auth.json`, `mcp-auth.json`, and `opencode.db` from
  `$XDG_DATA_HOME/opencode` (fallback `~/.local/share/opencode`), global config from
  `$OPENCODE_CONFIG_DIR` / `$XDG_CONFIG_HOME/opencode`, and caches from
  `$XDG_CACHE_HOME/opencode`. Verified against both the bundled 1.16.2 binary and
  the v1.17.20 source (`packages/core/src/global.ts` uses the `xdg-basedir` package;
  `packages/opencode/src/auth/index.ts` and `packages/core/src/database/database.ts`
  anchor auth/db to the data dir), so the mechanism survives the planned dependency
  upgrade unchanged.
- New in 1.17.x: a fourth root, `$XDG_STATE_HOME/opencode` (fallback
  `~/.local/state/opencode`), used for lock/state files. 1.16.2 does not read
  `XDG_STATE_HOME`, so injecting it is a no-op today and correct after the upgrade.
- Project-level OpenCode config stays inside `CC_WORKSPACE_DIR` via the workspace
  contract and is unaffected by this change.
- Bare-metal installs already have a persistent `$HOME`, so the option stays unset
  there by default; only the Docker image opts in.

## Design

- New optional env var `CC_OPENCODE_STATE_DIR`. When set, CommandsCenter injects
  into the OpenCode child environment (and only there):
  - `XDG_DATA_HOME=<stateDir>/data`
  - `XDG_CONFIG_HOME=<stateDir>/config`
  - `XDG_CACHE_HOME=<stateDir>/cache`
  - `XDG_STATE_HOME=<stateDir>/state` (ignored by 1.16.2, used by OpenCode 1.17+)
- OpenCode appends its own `opencode/` segment, so state lands at
  `<stateDir>/data/opencode/auth.json`, `<stateDir>/data/opencode/opencode.db`, etc.
  Separate `data`/`config`/`cache` roots are required: pointing all three XDG vars
  at `<stateDir>` directly would merge OpenCode's data, config, and cache into a
  single `<stateDir>/opencode` directory.
- **The option wins over ambient `XDG_*` variables** in the container/shell
  environment and over any stored secret with the same name. Its contract is
  "OpenCode state lives here"; inherited XDG values must not silently override it.
- When unset, behavior is exactly as today (no injected vars).
- Scope: the injection happens in the orchestrator's `resolveEnv`, so it affects
  the `opencode serve` process tree only. Known consequence: CC terminals and task
  runs are children of that process, so tools run inside them (e.g. `gh`) also see
  the redirected XDG paths. Acceptable — it keeps their state on the volume too —
  but must be documented.

### Touch points

1. `packages/backend/src/lib/runtime-config.ts`
   - Add `CC_OPENCODE_STATE_DIR: z.string().trim().optional()` to `envSchema`.
   - Resolve like `CC_WORKSPACE_DIR`/`CC_DATA_DIR`: absolute kept as-is, relative
     resolved against `cwd`. Expose as `opencode.stateDir?: string`.
   - Include the resolved path in `getStartupLogContext`.
2. New helper `packages/backend/src/opencode/opencode-env.ts`
   - `buildOpenCodeStateEnv(stateDir: string | undefined): NodeJS.ProcessEnv` —
     returns the three `XDG_*` entries, or `{}` when `stateDir` is undefined.
   - Pure function; no filesystem side effects.
3. `packages/backend/src/lib/start-server-runtime.ts`
   - Spread the helper's result **last** in `resolveEnv`:
     `({ ...process.env, ...(await secretService.buildEnvMap()), ...buildOpenCodeStateEnv(config.opencode.stateDir) })`.
   - Create `<stateDir>/{data,config,cache,state}` (recursive `mkdir`) once during
     startup, before the orchestrator starts. (OpenCode also `mkdir`s its own
     subdirectories on boot, so this is belt-and-braces for the roots themselves.)
4. Storage repair — n/a. The `opencode-storage-repair.ts` shim was removed in the
   1.17.20 upgrade, so there is nothing to keep in sync with the relocated db.
5. `Dockerfile`
   - `ENV CC_OPENCODE_STATE_DIR=/workspace/.cc/opencode` so Docker deployments get
     persistence by default. (Naming decision: `opencode` as a visible sibling of
     `.cc/data` and `.cc/workspace`, vs. hidden `.cc/.opencode` — pick one; the
     rest of the plan is unaffected.)
6. `.env.prod.example` (and `.env.example` if it documents `CC_OPENCODE_*`)
   - Document the key under the "OpenCode engine" section. The template also acts
     as the allowlist for persisting `CC_*` values into the generated env file on
     first run, so adding it there makes an operator-provided value stick.
7. Docs
   - README env-var table row.
   - `docs/deploy-coolify.md`: note that provider connections now persist across
     redeploys; add a migration hint (copy `/home/node/.local/share/opencode` into
     `<stateDir>/data/opencode` before restart) and note that without migration,
     providers must be reconnected once after upgrading to the image that sets the
     variable.

### Edge cases

- `OPENCODE_DB` explicitly set by an operator still wins for the db file path
  (absolute) or resolves relative to the redirected data root — existing OpenCode
  behavior, unchanged by this feature.
- Env precedence stays consistent with the rest of CC: shell/container env beats
  the `.env` file for `CC_OPENCODE_STATE_DIR` itself; the injected `XDG_*` values
  beat everything inside the child env.
- Restart loop: `resolveEnv` is re-evaluated on every respawn, so the injection
  holds across orchestrator restarts.

## Todo

- [x] Add `CC_OPENCODE_STATE_DIR` parsing/resolution to `runtime-config.ts` with tests
      (absolute, relative-to-cwd, unset).
- [x] Add `buildOpenCodeStateEnv` helper (plus `ensureOpenCodeStateDirs`) with tests
      (unset → `{}`; set → four XDG entries; wins over ambient XDG values).
- [x] Wire the helper into `resolveEnv` in `start-server-runtime.ts` and create the
      state subdirectories at startup.
- [x] Add boot integration tests: the child env captured from `resolveEnv` carries
      the injected `XDG_*` values (winning over ambient) and the roots are created;
      unset leaves the child env untouched.
- [x] Update `Dockerfile`, `.env.prod.example`, `.env.example`, README, and
      `docs/deploy-coolify.md`.
- [x] Run lint, typecheck, and focused + full backend tests (1221 passing).
- [x] End-to-end check: real opencode 1.17.20 binary, driven by the helper's env,
      wrote its db under the state dir and overrode an ambient `XDG_DATA_HOME`.

## Success criteria

- With `CC_OPENCODE_STATE_DIR=/workspace/.cc/opencode`, a container rebuild keeps
  provider connections (`auth.json`), MCP auth, and OpenCode sessions.
- Ambient `XDG_*` variables in the container do not override the configured state dir.
- With the variable unset, the child env is byte-for-byte what it is today.
- CC's own process env is untouched (no `XDG_*` injected into the server process).

## Out of scope

- Automatic migration of existing `~/.local/share/opencode` state (manual, documented).
- Whole-`$HOME`-on-volume persistence — see `plans/proposals/home-on-volume-persistence.md`.
