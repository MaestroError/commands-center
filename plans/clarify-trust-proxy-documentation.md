# Clarify CC_TRUST_PROXY Documentation

**Status:** Complete. Authored and verified 2026-07-22.

## Goal

Explain what `CC_TRUST_PROXY` controls, when each value is appropriate, which
forwarded headers become trusted, and what operational behavior changes after
the value is changed.

## Tasks

- [x] Trace Fastify, OAuth-provider, canonical-origin, and rate-limit usage.
- [x] Expand `.env.example` with concise true/false guidance.
- [x] Add a detailed README decision table, security requirements, and restart
      behavior.
- [x] Align the public MCP authentication guide with the README.
- [x] Format, lint, test, and verify the documentation changes.
- [x] Put the safe default, company public-domain answer, and a short yes/no
      decision before the implementation details.

## Acceptance Criteria

- Readers can decide between `false` and `true` without reading source code.
- Documentation states that `CC_PUBLIC_ORIGIN`, not `CC_TRUST_PROXY`, defines
  advertised browser and OAuth URLs.
- Documentation identifies `X-Forwarded-For`, `X-Forwarded-Proto`, and
  `X-Forwarded-Host` as trusted inputs when enabled.
- Documentation warns that the backend must be private and the last proxy must
  overwrite forwarded headers before `true` is safe.
- Documentation explains that changing the value requires a restart but does
  not itself invalidate OAuth tokens or client registrations.
