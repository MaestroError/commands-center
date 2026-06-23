# Fix plan: atomic, fail-safe installer + enforced Node 24

## Problem statement

A production VPS running CommandsCenter via systemd went down (HTTP 502) after an
attempted `0.15 → 0.16` upgrade. Root cause chain:

1. The operator ran the upgrade (`npm install -g commandscenter@latest`, directly or
   via `scripts/install-ccenter-service.sh`).
2. `npm install -g` is **destructive**: it removes the existing `/usr/bin/ccenter`
   bin symlink before the new version is fully in place.
3. The new install **failed mid-way** under Node 22:
   - `commandscenter` declares `engines.node: ">=24.0.0"` (since v0.8.0), but the box
     runs Node v22.22.3. With `engine-strict=false` this is only an `EBADENGINE`
     warning — **not** the abort.
   - The real abort came from a **native/postinstall step of a floated dependency**:
     `better-sqlite3` floated `^12.0.0 → 12.11.1` (runs `prebuild-install || node-gyp
rebuild`) and `opencode-ai` floated `^1.16.2 → 1.17.9` (runs `node
./postinstall.mjs`). With no Node-22 prebuilt ABI and/or no build toolchain, the
     install errors out.
4. Result: package files rolled back to `0.15.0`, **but no `ccenter` binary**. systemd
   `ExecStart=/usr/bin/ccenter ...` fails with `status=203/EXEC`, restarts on a loop
   (counter reached 368), and the reverse proxy returns 502 with no upstream.

### Why every previous upgrade "just worked"

`engines.node` is advisory by default; npm only warns. The app code never used a
Node-24-only runtime feature, and prior dependency versions still had Node-22-compatible
prebuilds/postinstalls. 0.16 is the first upgrade where a floated transitive dependency's
install step hard-failed on Node 22.

### The underlying defect (what we actually fix)

Two independent faults combined to turn a routine upgrade into an outage:

- **Drift**: the runtime we _publish/test/build_ on (Node 24 — CI, publish workflow,
  Dockerfile, `engines`) disagrees with the runtime the _installer_ provisions and
  accepts (`NODE_MAJOR=22`). Nothing guards this drift.
- **Non-atomic upgrade with no preflight and no rollback**: the installer mutates the
  live, working install before validating feasibility, and never restores a known-good
  state on failure.

**Design principle for this fix:** _An upgrade may fail, but it must never leave the
instance without a working binary or take down a previously-running service._ Failing
loudly and leaving the old version running is always preferable to a broken instance.

---

## Scope

All changes live in the install/release tooling; the published runtime code is unchanged.

- `scripts/install-ccenter-service.sh` — preflight, atomic install + rollback, ordering,
  Node-24 provisioning, systemd hardening, healthcheck.
- `scripts/stop-ccenter-service.sh` — keep consistent with new unit (review only).
- A new CI guard test asserting Node-version single-source-of-truth.
- `.nvmrc` (new) — single source of truth for the Node major.
- Docs (`README.md`, installer help text) — state Node 24 requirement.

Out of scope: changing `engines.node` (we are **enforcing 24**, not relaxing), changing
app runtime code, changing the dependency set.

---

## Decision (confirmed): enforce Node 24

We require Node `>=24` everywhere and make the installer **provision or upgrade** the box
to Node 24 rather than silently accepting 22. This aligns the installer with what we
already publish, test, and Dockerize on.

---

## Changes

### 1. Single source of truth for the Node major + CI guard (prevents recurrence)

The bug was _drift_. The durable fix is one canonical value plus a test that fails the
build when any consumer diverges.

- **Add `.nvmrc`** at repo root containing `24`.
- **Add a CI test** (e.g. `scripts/check-node-version-consistency.mjs`, wired into
  `release:check` and the CI workflow) that asserts all of the following resolve to the
  same major (24):
  - `packages/cli/package.json` `engines.node`
  - root `package.json` `engines.node`
  - `.nvmrc`
  - `Dockerfile` base image (`FROM node:<major>-...`)
  - `.github/workflows/ci.yml` and `publish.yml` `node-version`
  - `scripts/install-ccenter-service.sh` `NODE_MAJOR` default
- Test fails with a readable message naming the file(s) that diverge.

**Acceptance:** changing any one of the above without the others turns CI red.

### 2. Installer: bump `NODE_MAJOR` default 22 → 24 and actually upgrade

In `scripts/install-ccenter-service.sh`:

- `NODE_MAJOR="${CCENTER_NODE_MAJOR:-24}"` (was `22`).
- `node_major_ok` already compares `>= NODE_MAJOR`, so a Node-22 box now correctly fails
  the check and triggers `install_node_linux` / `install_node_macos`.
- `install_node_linux` already targets `node_${NODE_MAJOR}.x` from NodeSource, so it will
  install Node 24. Verify the NodeSource path works for an **upgrade** (existing Node 22
  present), not just a fresh install — on apt this means the new NodeSource list replaces
  the old major and `apt-get install -y nodejs` upgrades in place. Add an explicit
  `apt-get install --only-upgrade` fallback / clear message if it doesn't move.
- After provisioning, re-assert `node_major_ok` and `fail` with an explicit
  "Node 24 required, found vX — upgrade Node and re-run" message (already present, keep
  and ensure it fires before any package mutation).

### 3. Preflight gate — validate feasibility BEFORE mutating anything

New `preflight_checks()` called at the **top** of `main()`, before
`install_commandscenter` and before anything destructive. It must not modify the existing
install. Checks:

1. **Target version requirement vs local runtime.** Resolve the target's real engine
   requirement from the registry and compare to the local Node:
   ```sh
   target_required="$(npm view "commandscenter@${TARGET_VERSION:-latest}" engines.node 2>/dev/null)"
   ```
   If the local Node does not satisfy it (and we cannot/should not auto-upgrade, e.g.
   macOS without brew), `fail` with:
   ```
   commandscenter@0.16.0 requires Node >=24, but this host has v22.22.3.
   Upgrade Node to 24 (set CCENTER_NODE_MAJOR=24 to let the installer do it on Linux),
   then re-run. Your current install was left untouched.
   ```
2. **Build toolchain present** when a native build may be needed (`better-sqlite3`):
   check for `make`/`cc`/`python3` on Linux; if missing, install `build-essential
python3` _before_ the package install (so a prebuild miss can fall back to a working
   `node-gyp`), or fail clearly if unavailable.
3. **Registry reachability + disk space** sanity checks (best-effort, clear messages).
4. **Record current state for rollback** (see §4).

**Acceptance:** running the installer on a Node-22 box with `CCENTER_NODE_MAJOR` unset
either upgrades Node to 24 first, or (if it cannot) exits non-zero with the message above
**without removing the running binary or restarting the service**.

### 4. Atomic install with verify + rollback

Make package replacement recoverable so a mid-install failure never leaves a binary-less
host.

- **Snapshot** the currently-installed version before touching anything:
  ```sh
  PREV_VERSION="$(npm ls -g --depth=0 commandscenter --json 2>/dev/null \
    | node -e '...read JSON, print version or empty...')"
  ```
- **Install** the target version.
- **Verify** immediately:
  - `command -v ccenter` resolves to an executable, AND
  - `ccenter --version` runs and prints the expected target version.
- **On any failure** (install non-zero exit, or verify fails):
  - If `PREV_VERSION` is set, **roll back**: `npm install -g "commandscenter@${PREV_VERSION}"`
    and re-verify the binary is restored.
  - `fail` with a message explaining the upgrade failed, the previous version was
    restored, and the service was left running. Include the captured npm error.
  - Critically: **do not proceed to `install_service` / `start_service`**.

This turns `install_commandscenter` from "fire and hope" into "stage → verify →
commit-or-rollback".

### 5. Reorder `main()` so the live service is never torn down until the new binary is proven

Current order restarts the service regardless of binary health. New order:

```
main() {
  require_supported_os
  warn_if_root_service_user
  ensure_service_user
  resolve_service_group
  ensure_install_dir
  ensure_ownership
  ensure_node_and_npm          # provisions/upgrades to Node 24
  preflight_checks             # NEW — feasibility gate, no mutation
  install_commandscenter       # NEW — atomic install + verify + rollback
  resolve_ccenter_path         # hard-verifies the executable exists
  prepare_env_file
  install_service              # (re)write unit only after binary verified
  start_service                # restart only now
  wait_for_env_file
  healthcheck                  # NEW — see §7
  generate_claim_code
  print_summary
}
```

The running `systemd`/`launchd` service keeps serving the old version throughout the
install and is only restarted after the new binary is verified good.

### 6. Systemd unit hardening — stop the silent crash loop

In `install_systemd_service` heredoc, add:

- **Start-limit backstop** so systemd gives up instead of looping 368×:
  ```
  [Unit]
  StartLimitIntervalSec=60
  StartLimitBurst=5
  ```
  (with the existing `Restart=on-failure`, `RestartSec=5`). After 5 failures in 60s the
  unit enters `failed` and stops hammering, surfacing the problem instead of masking it.
- **Pre-exec guard** with a readable failure reason:
  ```
  ExecStartPre=/usr/bin/test -x ${CCENTER_PATH}
  ```
  so a missing/again-moved binary fails fast with an obvious cause in the journal.
- Keep absolute `ExecStart` path (systemd best practice); the installer already rewrites
  the unit on every run via `resolve_ccenter_path`, so a relocated bin is corrected on
  re-run.

Mirror the intent on macOS/launchd where applicable (KeepAlive already gates on
`SuccessfulExit=false`; document the lack of a hard start-limit and rely on healthcheck).

### 7. Post-start healthcheck before declaring success

New `healthcheck()` after `start_service` (and after `wait_for_env_file`): poll
`http://$HOST:$PORT/api/health` for up to N seconds. If it never comes up:

- Surface `journalctl -u commandscenter -n 50` (Linux) / err log tail (macOS) to the
  operator.
- `fail` with guidance. (Binary is verified at this point, so this catches _runtime_
  failures — e.g. a genuine Node-24-only runtime feature, bad env, port conflict.)

This is the last line of defense: the installer never prints "installed and running"
unless the app actually answered a health request.

### 8. Docs

- `README.md`: state **Node 24+ required**; note the installer will upgrade Linux hosts
  via NodeSource, and macOS users must have Node 24 (brew).
- Installer `print_summary` / help: mention Node 24 enforcement and
  `CCENTER_NODE_MAJOR` override.

---

## Test plan

Automated:

- **CI consistency test** (§1): unit-test it by temporarily diverging a fixture and
  asserting failure.
- Shell lint the installer (`shellcheck scripts/install-ccenter-service.sh`).

Manual / VM matrix (document in PR, run on throwaway VMs or containers):

1. **Node 22 box, fresh install** → installer upgrades to Node 24, installs, healthcheck
   passes.
2. **Node 22 box, `CCENTER_NODE_MAJOR` forced to 22** (simulating "can't upgrade") →
   preflight refuses cleanly, **no** existing binary removed, exit non-zero.
3. **Existing 0.15 install on Node 24, upgrade to 0.16** → atomic upgrade succeeds,
   service restarted only after verify.
4. **Forced mid-install failure** (e.g. point npm at a broken tarball / simulate
   `better-sqlite3` build failure) → rollback to previous version, binary restored,
   service still serving old version, clear error.
5. **Runtime failure after install** (bad env) → healthcheck fails, installer surfaces
   logs and exits non-zero.
6. Re-run installer on a host whose bin path moved → unit rewritten to correct path.

Regression target: reproduce the original outage (Node 22, 0.16, no build tools) and
confirm the new installer **either** upgrades Node and succeeds **or** refuses without
removing the working binary — never the 203/EXEC crash-loop.

---

## Rollout / ordering of work

1. `.nvmrc` + CI consistency guard (§1) — lock the source of truth first.
2. Installer `NODE_MAJOR=24` + Node provisioning/upgrade (§2).
3. Preflight gate (§3).
4. Atomic install + verify + rollback (§4) and `main()` reorder (§5).
5. Systemd hardening (§6) + healthcheck (§7).
6. Docs (§8).
7. Test matrix, then PR.

## Immediate operator remediation (the live VPS, outside this PR)

Not part of the code fix, but to get the down instance back now:

- Restore service on the existing 0.15.0: `sudo npm install -g commandscenter@0.15.0`
  (relinks the bin), `systemctl reset-failed commandscenter && systemctl restart
commandscenter`; **or** upgrade Node to 24 first then install `@latest`.
