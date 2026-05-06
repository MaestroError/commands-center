# E6. Ubuntu and macOS Service Installer Hardening

## Goal

Harden CommandsCenter installation and background-service setup for the only two explicitly supported operator environments: Ubuntu and macOS. Replace the current catch-all installer approach with two dedicated Bash installers, keep the overall workflow simple, and add CI smoke coverage for the supported OS matrix.

## Decision Summary

- Support only Ubuntu and macOS for the automated service installer.
- Do not target generic Linux or additional distros such as Fedora in this epic.
- Split the current installer into two explicit scripts: one for Ubuntu and one for macOS.
- Keep the public install flow simple: the existing top-level installer command may remain as a thin dispatcher or compatibility wrapper, but the platform behavior must live in the dedicated scripts.
- Add GitHub Actions smoke coverage for Ubuntu and macOS so installer regressions are caught before publish.

## Pre-Conditions

- E1 Runtime Bootstrap is complete.
- E3 API and Realtime Foundation is complete.
- E4 Self-Updating and Version Management is complete.
- The CLI packaging and publish flow is stable enough to smoke-test installation from a locally built package artifact.

## Scope

### Supported Platform Contract

- Explicitly support Ubuntu with systemd for Linux service installation.
- Explicitly support macOS with launchd for background service installation.
- Fail fast on unsupported platforms with a precise error message instead of attempting best-effort distro detection.
- Document the support matrix clearly in README and contributor workflow docs.

### Installer Structure

- Create a dedicated Ubuntu installer Bash script for package installation, env-file preparation, systemd unit generation, and service startup.
- Create a dedicated macOS installer Bash script for package installation, env-file preparation, launchd plist generation, PATH handling, and service startup.
- Keep shared behavior minimal and explicit. Prefer simple duplicated logic over a large abstraction layer unless a helper is clearly reused by both scripts.
- Preserve the current one-command user entrypoint by making `scripts/install-ccenter-service.sh` a thin dispatcher or backward-compatible wrapper around the platform-specific scripts.

### Runtime Command Stability

- Ensure generated service definitions use the supported CLI flags and do not depend on Node-reserved flags.
- Ensure the macOS service environment includes an explicit PATH so npm-installed binaries can resolve `node` outside an interactive shell.
- Verify that both installer flows generate the expected workspace, env-file, log, and service paths.

### CI Smoke Coverage

- Extend `.github/workflows/ci.yml` with installer smoke jobs on `ubuntu-latest` and `macos-latest`.
- Build a local package artifact in CI and install CommandsCenter from that artifact instead of relying on a published npm release.
- Validate script syntax, generated service configuration content, and startup command behavior in a stripped environment on both supported OSs.
- Keep CI pragmatic: hosted runners must at minimum validate generation and startup command correctness even if full service-manager lifecycle coverage remains limited by runner constraints.

### Documentation

- Update README install instructions to state that automated service installation supports Ubuntu and macOS only.
- Document the split-script structure and smoke-test workflow in CONTRIBUTING.
- Document any required manual verification steps that remain outside GitHub Actions coverage.

## Out of Scope

- Fedora, Arch, Debian, Alpine, or generic Linux-distro support.
- OpenRC, runit, s6, or non-systemd Linux service managers.
- A universal cross-distro prerequisite installer.
- Docker deployment changes beyond keeping existing container startup compatible.
- Reworking the CLI release/publish architecture beyond what is needed for installer correctness.

## Acceptance Criteria

- CommandsCenter provides two dedicated service installer scripts: one for Ubuntu and one for macOS.
- The existing top-level install command resolves to the correct supported installer or fails clearly when the OS is unsupported.
- Ubuntu installation generates and restarts a valid systemd service using the correct CLI startup command.
- macOS installation generates and starts a valid launchd agent with an explicit PATH and the correct CLI startup command.
- Installer docs state that only Ubuntu and macOS are supported for automated service setup.
- CI runs installer smoke coverage on `ubuntu-latest` and `macos-latest` for pull requests.
- CI uses a locally built package artifact so installer changes can be validated before npm publish.

## Key Files to Create/Modify

- `scripts/install-ccenter-service.sh`
- `scripts/install-ccenter-service-ubuntu.sh`
- `scripts/install-ccenter-service-macos.sh`
- `.github/workflows/ci.yml`
- `README.md`
- `CONTRIBUTING.md`

## Reference

- Existing installer: `scripts/install-ccenter-service.sh`
- Existing CI workflow: `.github/workflows/ci.yml`
- CLI startup flow: `packages/cli/src/cli.ts`
- Related CLI packaging work: `development/engine-infrastructure/04-self-updating-and-version-management.md`
