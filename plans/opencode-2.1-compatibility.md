# OpenCode 2.1 compatibility audit

- [x] Close implemented GitHub issues #151, #159 and #163.
- [x] Fetch released upstream source and SDK package, retaining CC's 2.0.27 pin.
- [x] Compare public contracts and typecheck the current integration against 2.1.
- [x] Run isolated runtime probes where possible and distinguish blockers from untested flows.
- [x] Document adaptation work and verification required before upgrading.

No application code or persisted workspace state is to be migrated during this audit. Reference source and package probes are ignored or temporary; no default workspace .gitignore changes are needed.

## Result — 2026-10-26

The embedded migration remains compatible with the exercised SDK 2.1.4 contracts. No production adapter changes were required by the source typecheck or existing adapter tests. A dependency-only upgrade would still fail the full backend typecheck because one test fixture uses a removed compaction property.

### Versions and isolation

- CC remains pinned to @opencode/sdk 2.0.27 in backend and CLI; package manifests and pnpm-lock.yaml were not changed.
- npm reports latest @opencode/sdk as 2.1.4. The published package was installed separately under /tmp/cc-opencode-2.1-audit.
- examples/opencode is now detached at release v2.1.4, commit 68bc26b7da1990ce10ffecfbc1e09eb13aa5d824. The reference checkout was clean before and after switching.
- Broad fetch encountered an unrelated preexisting vscode-v1.0.0 tag collision; an explicit v2.1.4 fetch succeeded without replacing that tag.
- Tests use a temporary Vitest config aliasing @opencode/sdk to the isolated 2.1.4 package. Typechecks similarly override the SDK type resolution. The active installation and real workspace were not upgraded.

### Verification

- Production backend sources typecheck successfully against 2.1.4.
- Full backend source + test typecheck reports exactly one diagnostic: embedded-message-mapper.test.ts:142 supplies `recent`, absent from SessionMessageCompactionCompleted.
- All 19 existing OpenCode adapter test files pass: **273 tests** on Node 24.21.0.
- Coverage includes host lifecycle, streaming chat, attachments, tier selection, reopening sessions, task execution/recovery, MCP discovery/execution, MCP OAuth fixtures, provider-service auth contracts, native CC/custom tools, permission enforcement and task permission snapshots.
- Provider/MCP tests use local fixtures and test doubles; no real external account was authorized.
- Evidence: /tmp/cc-opencode-2.1-types.log, /tmp/cc-opencode-2.1-src-types.log, /tmp/cc-opencode-2.1-tests.log, /tmp/cc-opencode-2.1-install.log.

### Contract changes and CC impact

| Upstream change                                                  | Current CC impact                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Replay blobs renamed to native; tool replay state merged         | CC's mapper reads display text and tool execution state, not the renamed provider replay blobs. No current production edit identified. Do not rename tool.state: it still represents execution status. |
| Credential.Key.configuration removed in favor of metadata        | CC connects API keys through integration.connect.key and OAuth through integration.oauth; it does not construct the removed credential field. No current production edit identified.                   |
| Compaction recent removed; retained history uses metadata.keepID | Production mapper reads summary only. Update the single test fixture, removing recent and optionally exercising metadata.keepID.                                                                       |
| providerContext replaced with native.messages                    | Replay remains SDK-owned; CC does not construct/read this field. Add long-context acceptance when upgrading.                                                                                           |
| session.compacted public event removed                           | Embedded event adapter does not subscribe to it. No SDK subscription change required.                                                                                                                  |
| SDK/plugin additions and MCP changes since 2.0.27                | Current host/plugin/tool/MCP implementations typecheck and their existing tests pass.                                                                                                                  |

### Adaptation checklist for the actual upgrade

1. Create an upgrade branch from codex/opencode-v2-migration.
2. Bump both backend and CLI SDK pins to 2.1.4; regenerate the lockfile together.
3. Replace the obsolete compaction fixture field and add focused fixtures for native replay metadata and keepID-based compaction, confirming they do not leak into display output or affect terminal-state recognition.
4. Update the SDK version in AGENTS.md and relevant current setup documentation. Keep historical audit records accurate rather than rewriting their versions.
5. Rerun normal package typechecks, ESLint and full tests using the real lockfile; repeat browser acceptance for chat, tasks and tool approvals.
6. Build/install the CLI package in a fresh environment, retain SDK externalization, and check native dependencies, terminal and file search. Repeat installed-package security audit against the separate release blockers.
7. Test opening a disposable copy of a 2.0.27 workspace under 2.1.4 and long-context compaction/replay before upgrading the live workspace.

### Limits and runtime note

These results do not certify packaged installation, Linux/Docker portability, real-provider OAuth, all long-context compaction paths, or an actual 2.0.27-to-2.1.4 database upgrade. Host reopen tests reopen a workspace created with 2.1.4, not one created by 2.0.27.

The isolated installation warns that transitive @opentui/core@0.6.8 declares Node >=26.4.0, although all 273 adapter tests passed on Node 24.21.0. This does not establish official Node 24 support or resolve the existing Node-transition/release decisions. No runtime version was changed.

Upstream says legacy stored/imported sessions and credentials have compatibility decoders and this contract change requires no database migration. That is upstream's stated compatibility, not a substitute for the copied-workspace upgrade test.

Sources: [official v2.1.4 changelog, including v2.1.0 breaking changes](https://github.com/anomalyco/opencode/blob/v2.1.4/CHANGELOG.md), [compaction schema](https://github.com/anomalyco/opencode/blob/v2.1.4/packages/schema/src/session-message.ts), [SDK package](https://www.npmjs.com/package/@opencode/sdk/v/2.1.4).

No application code was edited and no commit was made. Implemented issues #151, #159 and #163 were closed as completed; other issues remain open.

## Authorized upgrade execution

User requested a separate commit pushed directly to the migration branch after verification.

- [x] Update SDK pins, lockfile, current version documentation and compaction/native-data fixtures.
- [x] Run ESLint --fix, all package typechecks and unit/integration tests.
- [x] Run desktop/mobile browser suite and embedded-engine browser acceptance.
- [x] Build/package CLI and smoke-test installation plus old-engine workspace reopening.
- [ ] Record outcomes and remaining release limitations, then commit and push the upgrade.

### Packaging defect found during acceptance

- [x] Bundle jsonc-parser through its ESM entry: the UMD entry leaves dynamic ./impl/format requires in the single-file CLI and prevents fresh startup. This dependency was added before the SDK upgrade.
- [x] Rebuild/reinstall the tarball and verify native dependencies, owner claim and graceful shutdown again.

A fresh installed-package audit reports Zod GHSA-mrhx-c7xc-m3w5 (high) and provider-utils GHSA-866g-f22w-33x8 (low). Vulnerable Zod versions are also present in the pre-upgrade lockfile; this is a release-audit follow-up, not a runtime contract failure. No security exception is granted by this upgrade.

### Final upgrade verification

- All package typechecks and lint passed; ESLint --fix ran on changed TypeScript.
- Full tests: backend 1,816; frontend 1,633; shared 254; CLI 45 — **3,748 passed**.
- Desktop/mobile Playwright: **176 passed, 56 skipped** by the existing suite.
- Embedded SDK Playwright: **38 passed**, including chat, attachments, model tiers, file search, task scheduling/recovery, native/custom tools, MCP OAuth and specialist/task permissions.
- Node-version consistency, design-system audit and Knip passed. CLI build and pack passed.
- Fresh tarball installation passed native SQLite, bundled ripgrep and node-pty probes. The corrected tarball passed production startup, owner claim, rejection of invalid shutdown credentials and authenticated graceful HTTP shutdown with exit 0.
- A disposable workspace created by SDK 2.0.27 reopened under 2.1.4, retained its assistant history, accepted new prompts, completed manual compaction and continued afterward. The initial compaction probe returned a generic mock answer and was correctly rejected by the summary-template validator; supplying a conforming mock summary passed. No CC production code change was needed for compaction.
- The JSONC bundler fix was verified by the previously failing fresh-install startup smoke passing after rebuilding/reinstalling. CLI tests were repeated and passed (45).
- Node remains 24.21.0. Linux/Docker and real-account provider OAuth were not revalidated in this upgrade run. This is approval for the development integration branch, not a release/security sign-off.

Logs: /tmp/cc-21-tests.log, /tmp/cc-21-e2e.log, /tmp/cc-21-embedded-e2e.log, /tmp/cc-21-lint.log, /tmp/cc-21-build-final.log, /tmp/cc-21-cli-smoke.log, /tmp/cc-21-package-audit.json. Temporary test workspaces and the real local workspace remain separate.
