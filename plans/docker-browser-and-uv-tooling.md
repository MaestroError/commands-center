# Docker browser and uv tooling

## Goal

Provide an opt-in Full CommandsCenter Docker image for Python-based MCPs
launched through `uvx` and browser-based MCPs that require Playwright Chromium,
without increasing the existing Basic image or requiring operators to modify a
running container.

## Scope

- Keep `Dockerfile` as the existing lean Basic image.
- Add `Dockerfile.full` as the recommended opt-in image for MCP-heavy installs.
- Copy pinned `uv` and `uvx` binaries from Astral's official container image
  into the Full image.
- Install a pinned Playwright CLI, its Chromium browser build, and Chromium's
  Debian runtime dependencies while the image is built as root.
- Keep browser files in a shared, read-only location that the runtime `node`
  user and dynamically installed MCP packages can discover.
- Ensure the suggested `mcp-mermaid` configuration does not rerun its
  privileged Playwright dependency installer at runtime.
- Update Docker and Coolify documentation with the included tools, image-size
  impact, runtime behavior, and upgrade guidance.
- Do not preinstall suggested MCP packages.

## Implementation tasks

1. **Docker variants and toolchain**
   - Preserve the Basic Dockerfile without browser or uv additions.
   - Add a separate Full Dockerfile with the same CommandsCenter runtime
     contract.
   - Hard-pin the Astral uv build-stage image and add a pinned Playwright build
     argument.
   - Copy `uv` and `uvx` into `/usr/local/bin`.
   - Install Playwright globally and install Chromium with its Debian system
     dependencies during the root-owned image build.
   - Set a shared `PLAYWRIGHT_BROWSERS_PATH` and verify its contents are
     readable and executable by the runtime `node` user.

2. **Mermaid startup compatibility**
   - Add a Mermaid-specific npm environment override so its unconditional
     `playwright install --with-deps chromium` postinstall does not attempt to
     elevate privileges when `npx` installs it as `node`.
   - Preserve the generic npm lifecycle behavior for all other stdio MCPs.
   - Add focused coverage for the generated suggested MCP configuration.

3. **Documentation**
   - Update the main Docker instructions and Coolify guide to list `uv`/`uvx`,
     Playwright, and Chromium as image-provided tools.
   - Explain that these tools are built into new images, require a rebuild to
     adopt, and increase image size in exchange for browser MCP compatibility.
   - Replace obsolete customization advice that tells operators to install uv
     themselves.

4. **Verification**
   - Run formatting/lint autofix and the relevant unit tests, then the full
     repository test suite required by the project.
   - Build the Docker image locally.
   - As the runtime `node` user, verify `uv`, `uvx`, Playwright, and Chromium.
   - Run an MCP SDK handshake and a real Mermaid render through
     `npx -y mcp-mermaid`.
   - Exercise a representative `uvx` MCP startup and a Playwright browser
     launch inside the built image.
   - Start CommandsCenter from the image and verify `/api/health` end to end.

## Success criteria

- `uv --version` and `uvx --version` succeed in a fresh container.
- Chromium launches headlessly through the installed Playwright package as
  the `node` user.
- `mcp-mermaid` remains connected over stdio and generates a diagram rather
  than exiting during package installation.
- A Python MCP can be resolved and started through `uvx`.
- The CommandsCenter container reaches its health endpoint with a mounted
  workspace.
- Lint and test checks pass, and no suggested MCP package is baked into the
  image.

## Verification results

- Built both images successfully on Docker Desktop for Apple Silicon. The Basic
  image is 427,833,384 bytes and the Full image is 917,727,736 bytes.
- Confirmed the Basic image still runs as `node`, reports the CommandsCenter
  version, and does not contain `uv`, `uvx`, Playwright, or Chromium.
- Confirmed the runtime identity is `node` (UID/GID 1000), with uv/uvx 0.11.33,
  Playwright 1.62.0, and Chromium 151.0.7922.34.
- Launched Chromium headlessly as `node` and loaded an in-memory page.
- Connected to `mcp-mermaid` over MCP stdio and generated a 12,460-byte SVG.
- Connected to `@playwright/mcp@latest`, discovered 24 tools, and navigated to
  `https://example.com` through the image-provided Chromium executable.
- Connected to `duckduckgo-mcp-server` through `uvx` and discovered two tools.
- Started both CommandsCenter image variants and observed `/api/health` reach
  `status: ok` with OpenCode and the scheduler healthy.
- Passed ESLint autofix, Prettier, TypeScript typecheck, all unit tests, and the
  full Playwright E2E suite (170 passed, 56 skipped).

## CI audit follow-up

- Upgrade the existing `js-yaml@4.1.1` security override from 4.3.0 to the
  patched 4.3.1 release required by GHSA-5p4m-2wfm-xmqj.
- Regenerate the pnpm lockfile without broad dependency upgrades.
- Verify the high-severity audit, lint, typecheck, and tests before updating the
  pull request.

## Review follow-up

- Resolve the existing system install mode on the Integrations page.
- Apply Mermaid's `npm_config_ignore_scripts=true` preset only to Docker
  installations, where the Full image provides Chromium and its dependencies.
- Preserve Mermaid's normal package lifecycle scripts for npm-global and
  npm-local installations.
- Cover both Docker and non-Docker preset behavior before updating the pull
  request.

## Coolify follow-up

- Keep the named `uv` build stage in `Dockerfile.full` and hard-pin its image
  reference so Coolify does not depend on global `ARG` scope or unsupported
  variable expansion in `COPY --from`.
- Make the Full image the default Coolify recommendation because immutable
  deployments cannot persist tools installed in a running container.
- Present the Basic image as the smaller opt-out for installations that do not
  need browser-based or Python MCPs.
- Document the failed-build signature and direct operators to copy
  `Dockerfile.full` verbatim.

## Coolify ARG-scope follow-up

- Remove `UV_VERSION` expansion from `FROM` so the Full Dockerfile remains
  valid even when pasted into a builder configuration with an earlier stage.
- Keep the uv version pinned directly in the named stage and continue copying
  the binaries through `COPY --from=uv`.
- Rebuild the exact repository Dockerfile and verify the installed uv,
  Playwright, and Chromium versions as the runtime `node` user.

Verification: the hard-pinned Dockerfile built successfully, and its runtime
`node` user executed uv/uvx 0.11.33, Playwright 1.62.0, and Chromium
151.0.7922.34 from the configured executable path.

## Coolify transient build follow-up

- Inspect the complete Coolify log and confirm that the Dockerfile parsed,
  installed its dependencies, and reached Chromium's download before the
  temporary build container exited with code 255 without a Docker or
  Playwright error.
- Retain the validated Node 24 Full Dockerfile after the same definition
  succeeded on a subsequent Coolify build.
- Document that an abrupt `docker exec` exit 255 during an otherwise healthy
  browser download is a Coolify host/build-container failure and should first
  be retried, with host memory and disk checked if it repeats.

## Mermaid Docker environment follow-up

- Update the Docker-specific Mermaid suggestion with the environment that was
  validated in a deployed Coolify container:
  `npm_config_cache=/workspace/.cc/npm-cache`,
  `npm_config_ignore_scripts=true`, and
  `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.
- Keep the non-Docker Mermaid suggestion unchanged so its normal package
  lifecycle remains available outside the Full image.
- Update the existing-registration guidance and focused frontend coverage for
  the complete Docker preset.
