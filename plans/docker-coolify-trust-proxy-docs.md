# Docker And Coolify Proxy-Trust Documentation

**Status:** Complete. Authored and verified 2026-07-22.

## Goal

Make Docker and Coolify installation instructions explicitly configure
`CC_TRUST_PROXY=true` whenever the container is served through a public HTTPS
domain by a reverse proxy, while keeping direct localhost Docker access on the
safe `false` default.

## Tasks

- [x] Add `CC_TRUST_PROXY` to the production environment template.
- [x] Distinguish direct-local and public-domain Docker Compose / `docker run`
      values in the README.
- [x] Require `CC_TRUST_PROXY=true` in the Coolify environment table and
      troubleshooting guidance.
- [x] Format, lint, test, and verify all updated instructions.
- [x] Replace workforce-specific terminology with users/MCP users and state the exact
      Coolify Environment Variables UI settings.

## Acceptance Criteria

- Coolify users are told to set both the exact HTTPS `CC_PUBLIC_ORIGIN` and
  `CC_TRUST_PROXY=true`.
- Docker users see `false` for direct localhost access and `true` for a public
  HTTPS domain behind a trusted proxy.
- Public Docker examples bind the host port to loopback so the reverse proxy is
  the only network path to CommandsCenter.
- No image-level default enables proxy trust for direct Docker users.
