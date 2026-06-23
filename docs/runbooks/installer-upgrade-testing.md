# Installer Upgrade Testing Runbook

Use this to validate `scripts/install-ccenter-service.sh` before trusting it on a
production instance, especially after changes to the install/upgrade flow. These
scenarios exercise the Linux-only paths (`apt`, NodeSource, `systemd`, global
`npm`) that cannot run in unit tests, and they verify the core guarantee:

> An upgrade may fail, but it must never leave the host without a working binary
> or take down a previously-running service.

Run on a **throwaway Ubuntu host** (a $5 VPS or a container) — never first on a
real instance. Snapshot, run a scenario, restore, repeat. Each scenario lists a
manual procedure and the pass criteria; the same steps can later be scripted for
automated/CI smoke testing (see "Automating" at the end).

## Conventions

```bash
INSTALLER=scripts/install-ccenter-service.sh   # path or curl'd copy on the host
SERVICE=commandscenter
HEALTH=http://127.0.0.1:3000/api/health
```

Helpers used throughout:

```bash
# Current global version (empty if not installed)
ccver() { npm ls -g --depth=0 commandscenter --json 2>/dev/null \
  | node -p 'JSON.parse(require("fs").readFileSync(0)).dependencies?.commandscenter?.version || ""'; }

svc() { systemctl status "$SERVICE" --no-pager -l | head -n 12; }
health() { curl -fsS -m 3 "$HEALTH" && echo " OK" || echo " UNHEALTHY"; }
```

---

## Scenario 1 — Fresh install on Node 22

**Setup:** Clean Ubuntu with Node 22 (or no Node), no commandscenter installed.

```bash
node -v                 # v22.x or absent
bash "$INSTALLER"
```

**Pass:** installer upgrades Node to 24 (`node -v` → v24.x), installs the latest
commandscenter, `health` returns `OK`, `svc` shows `active (running)`.

---

## Scenario 2 — Preflight refusal leaves a running instance untouched

Simulates "Node cannot be upgraded" — the gate must refuse **before** mutating
anything.

**Setup:** A working instance already installed and healthy on Node 24.

```bash
ccver; health        # record baseline version + healthy
# Force the preflight to consider the host too old without changing Node:
CCENTER_NODE_MAJOR=24 ... # (only relevant on a 22 host; on 24 use a build that needs >24)
```

On a Node 22 host, instead run the installer with auto-upgrade disabled by
pointing it at a target whose engines exceed the local Node, or temporarily set
`CCENTER_NODE_MAJOR` below the published requirement so `ensure_node_and_npm`
does not upgrade. The intent: reach `preflight_checks` with local Node below the
target requirement.

**Pass:** installer exits non-zero with `requires Node >=… your current install
was left untouched`; `ccver` is unchanged; `health` still `OK`; the service was
never restarted.

---

## Scenario 3 — Normal upgrade on Node 24

**Setup:** Previous version installed and healthy on Node 24.

```bash
ccver                  # e.g. 0.15.0
bash "$INSTALLER"
ccver; health          # new version, OK
```

**Pass:** atomic upgrade succeeds; service is restarted only after the new binary
verifies; `health` returns `OK`.

---

## Scenario 4 — Mid-install failure rolls back the binary

The key recovery path. Force `npm install -g` to fail and confirm the previous
version is restored.

**Setup:** A working version installed (record `ccver`). Break the install, e.g.:

- point npm at an unreachable registry: `npm config set registry http://127.0.0.1:1`, or
- request a nonexistent version via `CCENTER_PACKAGE_SPEC=commandscenter@9.9.9`.

```bash
ccver                                   # baseline, e.g. 0.15.0
CCENTER_PACKAGE_SPEC=commandscenter@9.9.9 bash "$INSTALLER"; echo "exit=$?"
ccver; command -v ccenter; health       # still baseline, binary present, OK
```

**Pass:** installer exits non-zero with a rollback message; `ccver` is back to the
baseline; `command -v ccenter` resolves; the old service is still serving
(`health` → `OK`). Restore the registry afterward: `npm config delete registry`.

---

## Scenario 5 — Healthy install, unhealthy runtime rolls the service back

Install succeeds and the binary verifies, but the app fails to become healthy.

**Setup:** A working previous version installed. Induce a runtime failure for the
new version, e.g. occupy its port so it cannot bind:

```bash
ccver                                   # baseline
# Hold port 3000 so the restarted service cannot become healthy:
python3 -m http.server 3000 >/dev/null 2>&1 &
HOLDER=$!
bash "$INSTALLER"; echo "exit=$?"
kill "$HOLDER"
```

**Pass:** installer detects the failed healthcheck, dumps recent logs, and **rolls
the service back** to the previous version with a clear message. After freeing the
port and a restart, `health` returns `OK`. (Note: this scenario's port conflict is
a stand-in for any runtime regression.)

---

## Scenario 6 — Regression test for the original outage

Reproduce the exact failure: Node 22, install latest (which requires Node 24),
no build toolchain.

**Setup:** Node 22 host, `build-essential`/`python3` removed if present.

```bash
node -v                                 # v22.x
bash "$INSTALLER"
```

**Pass — one of:**

- installer upgrades Node to 24, installs the build toolchain, installs latest,
  `health` → `OK`; **or**
- if Node cannot be upgraded, installer refuses at preflight without removing any
  existing binary.

**Fail (the bug):** `ccenter` ends up missing and `systemctl status` shows
`status=203/EXEC` in a restart loop.

---

## After any failed-upgrade scenario

Confirm the box is in a known-good state before moving on:

```bash
ccver
command -v ccenter && ccenter --version
svc
health
journalctl -u "$SERVICE" -n 30 --no-pager
```

## Automating

Each scenario is structured as _setup → run installer → assert (`ccver`,
`command -v ccenter`, `health`, `systemctl is-active`)_. To turn this into a CI
smoke test, run scenarios 1, 4, and 6 inside disposable Ubuntu containers and
assert the pass criteria programmatically; scenarios 2 and 5 need a service that
binds a port, so run them on a VM or a privileged container with `systemd`.
