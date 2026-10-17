# v1.0.0 release audit findings

Release preparation is blocked on review/remediation of these findings from
`pnpm audit --prod --audit-level high` (2026-10-16). The registry reported 66
advisories: 1 critical, 14 high, 40 moderate and 11 low. Counts are advisories,
not unique packages. This is dependency inventory evidence, not a finding that
every advisory is exploitable through CC. No new advisory exceptions were added.

| Severity | Package                        | Patched range reported | Advisory                                                                 | Dependency path                                                                                       |
| -------- | ------------------------------ | ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| high     | `fast-uri`                     | `>=3.1.7`              | [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3) | packages\_\_backend → @modelcontextprotocol/sdk → ajv → fast-uri                                      |
| high     | `fast-uri`                     | `>=3.1.7`              | [GHSA-58mr-gqgx-xq4g](https://github.com/advisories/GHSA-58mr-gqgx-xq4g) | packages\_\_backend → @modelcontextprotocol/sdk → ajv → fast-uri                                      |
| high     | `brace-expansion`              | `>=5.0.11`             | [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | packages\_\_backend → @opencode/sdk → @opencode/util → minimatch → brace-expansion                    |
| high     | `brace-expansion`              | `>=5.0.10`             | [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | packages\_\_backend → @opencode/sdk → @opencode/util → minimatch → brace-expansion                    |
| high     | `fastify`                      | `>=5.12.2`             | [GHSA-667r-xxjv-c9mm](https://github.com/advisories/GHSA-667r-xxjv-c9mm) | packages\_\_backend → fastify                                                                         |
| high     | `fastify`                      | `>=5.12.2`             | [GHSA-p68q-wchp-6fh7](https://github.com/advisories/GHSA-p68q-wchp-6fh7) | packages\_\_backend → fastify                                                                         |
| high     | `fastify`                      | `>=5.12.2`             | [GHSA-hwr6-493r-vm6h](https://github.com/advisories/GHSA-hwr6-493r-vm6h) | packages\_\_backend → fastify                                                                         |
| high     | `fastify`                      | `>=5.12.2`             | [GHSA-9q9j-q6p8-xq58](https://github.com/advisories/GHSA-9q9j-q6p8-xq58) | packages\_\_backend → fastify                                                                         |
| high     | `braces`                       | `<0.0.0`               | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | packages\_\_backend → @opencode/sdk → @opencode/core → @parcel/watcher → micromatch → braces          |
| high     | `source-map-js`                | `>=1.2.2`              | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | packages\_\_frontend → @milkdown/crepe → vue → @vue/compiler-dom → @vue/compiler-core → source-map-js |
| critical | `proxy-addr`                   | `>=2.0.8`              | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | packages\_\_backend → @modelcontextprotocol/sdk → express → proxy-addr                                |
| high     | `@vue/server-renderer`         | `>=3.5.42`             | [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) | packages\_\_frontend → @milkdown/crepe → vue → @vue/server-renderer                                   |
| high     | `prosemirror-view`             | `>=1.42.3`             | [GHSA-c8x8-7fp4-3x9w](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w) | packages\_\_frontend → @milkdown/crepe → prosemirror-virtual-cursor → prosemirror-view                |
| high     | `@modelcontextprotocol/client` | `>=2.2.0`              | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | packages\_\_backend → @opencode/sdk → @opencode/core → @modelcontextprotocol/client                   |
| high     | `@modelcontextprotocol/sdk`    | `>=1.31.0`             | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) | packages\_\_backend → @modelcontextprotocol/sdk                                                       |

## Remediation plan

1. Update compatible direct dependencies (Fastify and MCP SDK) and replace stale
   overrides for fast-uri and brace-expansion with patched versions.
2. Resolve patched transitive packages through compatible updates; inspect the
   SDK's MCP client requirement before overriding it. Do not upgrade the engine
   blindly after acceptance.
3. Investigate the braces advisory (registry reports no patched version) for
   actual reachability through OpenCode's file watcher. Determine an upstream
   fix or documented mitigation; do not silently suppress it.
4. Review frontend dependency paths for whether affected code ships in the
   browser bundle, and apply compatible fixes.
5. Re-run audit, release gate, all package tests, embedded E2E and packed-install
   smoke after dependency changes. Rebuild the final tarball and record its hash.

Raw audit evidence: `/tmp/cc-v1-audit.json`, `/tmp/cc-v1-audit.log`.

## Remediation execution (2026-10-17)

- [x] Verify advisories and compatible patched versions; investigate braces reachability.
- [x] Update Fastify and MCP SDK plus scoped transitive overrides, retaining OpenCode 2.0.27.
- [x] Re-audit without adding advisory exceptions.
- [x] Run lint fixes, release gate and all package tests.
- [x] Complete the final embedded browser regression rerun and installed-package smoke.
- [ ] Resolve published MCP client packaging and the unpatched braces decision before release.

### Results and remaining release blockers

Workspace production audit: 0 critical, 1 high, 36 moderate, 11 low
(`/tmp/cc-security-final-audit.json`). The high finding is braces. MCP client/core
2.2.0 passed 41 focused runtime/MCP/OAuth tests and the full package tests.
The full package suite passed: backend 1623, frontend 1587, shared 234, CLI 45
(the temporary packaging probe added five passing tests, subsequently removed).
`pnpm release:check` passed; formatting passed.

**Published package is not yet remediated for the MCP OAuth advisory.** Root pnpm
overrides do not propagate to npm consumers. A generated npm shrinkwrap was
tried, included in the tarball, and tested with npm 11.19.0 local and isolated
global installs. The installed SDK still resolved MCP client/core 2.0.0. The
ineffective shrinkwrap, refresh script and associated checks were removed.
Current npm documentation also states npm 12 no longer reads published
shrinkwraps. Do not present the workspace audit as the installed-package audit.

OpenCode remains pinned at 2.0.27; the inspected 2.0.32 package still pins MCP
client/core 2.0.0. Preferred next step: obtain an upstream engine release with
patched MCP dependencies, then repeat engine acceptance. An alternative is to
ship a maintained patched dependency bundle, which changes packaging and needs
fresh platform verification. No postinstall rewriting or silent exception was
added to bypass this blocker.

**Braces has no patched release.** The only production path found was OpenCode
core → Parcel watcher → micromatch → braces. Parcel calls micromatch.makeRe,
which delegates to Picomatch, rather than the vulnerable Braces methods. The
probe in `.artifacts/v1-security/braces-reachability.mjs` replaces Braces exports
with a throwing proxy, runs ordinary and 1000-level nested patterns through the
actual watcher wrapper, and reports zero Braces calls. This supports limited
reachability for this path, not a blanket safety guarantee. User chose to wait for upstream fixes for both advisories; no exception is
accepted. Recheck on November 8, 2026 alongside the Node 26 transition.

First embedded browser run: 22/23 passed; specialist editor navigation timed out
while the release build concurrently rewrote frontend output. Rerunning after
build completion passed 23/23 in 2.5 minutes, consistent with a test-environment
race. No application or test changes were needed.

Evidence: `/tmp/cc-security-release.log`, `/tmp/cc-security-tests.log`,
`/tmp/cc-security-e2e.log`, `/tmp/cc-security-e2e-final.log`,
`/tmp/cc-security-unique-install.log`, `/tmp/cc-security-global-install.log`.
Installed-package audit (`/tmp/cc-security-installed-audit.json`): 0 critical,
2 high (MCP client and braces), 1 moderate, 1 low. Native SQLite query, bundled
ripgrep and PTY execution passed. Fresh startup and workspace reopening each
reported a healthy embedded engine and drained cleanly on SIGTERM.

The final diagnostic tarball has no ineffective shrinkwrap and is not approved
for publication. SHA-256:
`ccb1ad8bd9f5f15e7318ebebc6f691af17e65195efca139dce98f720603caa67`.
