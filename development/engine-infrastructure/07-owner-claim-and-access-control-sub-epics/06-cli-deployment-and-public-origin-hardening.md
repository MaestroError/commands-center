# E7.6 CLI, Deployment, and Public-Origin Hardening

## Goal

Complete operator-facing setup and recovery paths for npm-global, Bash service installer, Docker, and VPS/public-domain deployments. After this sub-epic, operators can retrieve or rotate claim codes from the correct workspace context, understand reverse proxy requirements, and safely expose CommandsCenter behind HTTPS.

## Pre-Conditions

- E7.1 Owner Auth State and Claim Code Service is complete.
- E7.2 Claim, Login, Logout, and Session API is complete.
- E7.3 Backend Route Protection, CSRF, Origin, and Realtime Security is complete enough to define origin configuration.
- E6 Ubuntu and macOS Service Installer Hardening may be implemented after or alongside this sub-epic; any installer docs must align with E6.

## Scope

### CLI Claim-Code Command

- Add `ccenter claim-code` or equivalent CLI command.
- The command must work for unclaimed workspaces and claimed workspaces.
- The command must rotate and print a fresh one-time claim code for the active workspace.
- The command must respect `--cc-env-file`, `CC_WORKSPACE_DIR`, and service/Docker workspace paths.
- For claimed workspaces, command output must explain that the current owner password remains valid until reclaim completes.
- Command output must warn that anyone who reads the claim code gets temporary owner recovery power.
- Do not print password hashes, claim-code hashes, session IDs, CSRF tokens, cookies, or other auth internals.

### Runtime Startup Instructions

- On first run for an unclaimed workspace, generate or reuse an active one-time claim code and print clear setup instructions.
- CLI output, Docker logs, and service logs must instruct the operator to open `/claim`.
- Startup output must include local URL and public binding warnings when binding to `0.0.0.0` or an externally reachable host.
- The claim code must not be baked into Docker images or committed artifacts.
- After a workspace is claimed, startup logs must not keep leaking old claim codes.

### NPM Global Path

- Document install with `npm install -g commandscenter`.
- Document start with `ccenter start`.
- Explain first-run claim-code output and `/claim` setup.
- Explain missed/expired/rotated code recovery with `ccenter claim-code` from the same workspace context.

### Bash Service Installer Path

- Installer docs must explain where the env file and workspace directory live.
- Installer docs must explain where to read service logs for the first claim code.
- If the installer can run `ccenter claim-code` under the service user, document or implement that direct output path.
- Reclaim instructions must run the command under the service user or with the exact same workspace/env context.
- Generated service docs must tell operators to claim before exposing DNS publicly.

### Docker Path

- Container startup must generate a claim code for an unclaimed mounted workspace and write it to container logs.
- Reclaim instructions must use `docker exec <container> ccenter claim-code` or a documented one-shot command using the same mounted volume.
- Docker docs must emphasize persistent volume mounting for `.cc/workspace/auth/`, database, agents, and all portable state.
- Docker docs must explain that the claim code is runtime-generated, not image-baked.
- Docker smoke coverage should confirm first-run logs include claim instructions without leaking secrets after claim completion.

### VPS and Public Domain Path

- Document recommended HTTPS reverse proxy setup with Caddy, nginx, Traefik, or a platform load balancer.
- Explain that CommandsCenter enforces owner sessions even if the reverse proxy also has access control.
- Show setup sequence: start app, retrieve claim code from logs or CLI, claim at `https://domain/claim`, then use normal login afterward.
- Document `CC_PUBLIC_ORIGIN` or `CC_ALLOWED_ORIGINS` with public `https://` examples.
- Document required `X-Forwarded-Proto`, host forwarding, HTTPS, cookie `Secure` behavior, and WebSocket upgrade forwarding.

### Environment and Examples

- Update `.env.prod.example` with public origin / allowed origin variables and comments.
- Ensure public origin examples align with backend origin checks from E7.3.
- Update README and CONTRIBUTING only where user or developer workflow changes.

## Out of Scope

- Implementing service installer hardening itself if owned by E6, except auth-specific instructions required here.
- Multi-user accounts, teams, roles, invitations, OAuth login, email reset, or external API token management.
- Future bearer-token API access; keep it documented only as future work if mentioned.

## Acceptance Criteria

- `ccenter claim-code` creates a code for an unclaimed workspace.
- `ccenter claim-code` rotates a code for a claimed or unclaimed workspace.
- The command respects `--cc-env-file`, `CC_WORKSPACE_DIR`, and service/Docker workspace paths.
- First-run unclaimed startup logs include local URL, claim instructions, and one-time claim code.
- Claimed startup logs do not leak old claim codes.
- Docker first-run logs include claim instructions for mounted workspaces.
- Docker and service reclaim docs target the same active workspace context.
- Deployment docs cover npm-global, Bash service installer, Docker, and VPS/public-domain setup paths.
- Reverse proxy docs include HTTPS, forwarded proto/host headers, cookie `Secure` behavior, and WebSocket upgrade forwarding.
- `.env.prod.example` documents public origin / allowed origin configuration.
- CLI and deployment smoke tests cover claim-code generation/rotation and first-run log behavior.

## Key Files to Create/Modify

- `packages/cli/src/cli.ts`
- `packages/cli/test/cli.test.ts`
- `packages/cli/test/run-cli.test.ts`
- `packages/backend/src/lib/start-server-runtime.ts`
- `packages/backend/src/lib/runtime-config.ts`
- `.env.prod.example`
- `README.md`
- `CONTRIBUTING.md`
- Docker docs/scripts
- Ubuntu and macOS service installer docs/scripts as aligned with E6

## Reference

- Parent epic: `development/engine-infrastructure/07-owner-claim-and-access-control.md`
- CLI startup: `packages/cli/src/cli.ts`
- Runtime startup: `packages/backend/src/lib/start-server-runtime.ts`
- Installer hardening epic: `development/engine-infrastructure/06-ubuntu-and-macos-service-installers.md`
- Portable workspace rule: `.cc/workspace/auth/`, database, agents, credentials, and all user state must move with the workspace.
