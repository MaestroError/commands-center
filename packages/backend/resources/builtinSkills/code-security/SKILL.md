---
name: code-security
description: Review or harden code for security vulnerabilities, unsafe data flows, weak authorization, injection risks, secret leaks, dependency risk, and AI or tool-execution attack surfaces. Use when code handles user input, files, authentication, authorization, external integrations, webhooks, secrets, generated content, or privileged actions.
compatibility: opencode
metadata:
  category: quality
  version: 1.0.0
---

# code-security

Use this skill to find practical security risks and propose fixes that fit the codebase. Treat external input, generated content, files, network responses, and tool outputs as untrusted.

## Security workflow

1. Identify trust boundaries: HTTP requests, forms, files, webhooks, third-party APIs, database records, environment variables, LLM output, and tool responses.
2. Identify protected assets: credentials, tokens, workspace files, user data, provider auth state, privileged actions, and system configuration.
3. Trace untrusted data from entry point to storage, rendering, shell commands, network calls, database calls, or tool invocation.
4. Check whether validation happens at the system boundary and whether internal code relies on validated types.
5. Verify authentication and authorization are enforced where the action happens, not only in the UI.
6. Review error messages and logs for secret or implementation detail leaks.
7. Check dependency, configuration, and supply-chain impact when a change adds packages or new external services.

## Vulnerability checklist

- Injection: SQL, command, path traversal, template injection, prompt/tool injection, and unsafe dynamic evaluation.
- Broken access control: missing ownership checks, broad roles, confused-deputy flows, and client-controlled permission decisions.
- Secrets: committed keys, leaked tokens in logs, secrets passed to prompts, and long-lived credentials without rotation guidance.
- XSS and unsafe rendering: `innerHTML`, markdown/HTML rendering, URL attributes, and unescaped generated content.
- SSRF and network abuse: user-controlled URLs, redirects, private IP ranges, metadata endpoints, and weak allowlists.
- File handling: unsafe filenames, archive extraction, symlink traversal, MIME spoofing, large files, and executable uploads.
- CSRF/CORS/session issues: weak cookie settings, broad origins, missing same-site protections, and token storage in browser-accessible locations.
- DoS: unbounded loops, recursion, input sizes, query fanout, retries, concurrency, or token usage.
- Dependency risk: vulnerable packages, unnecessary runtime dependencies, postinstall scripts, typosquats, and missing lockfile discipline.
- AI/agent risk: untrusted prompt content, model output used as code or commands, excessive tool permissions, and missing confirmation for destructive actions.

## PR review comments

If the user provides a PR link and an appropriate review/comment tool is available, add direct line-level comments for concrete security findings. Prefer direct comments for exploitable or likely risks. Keep speculative threat-model notes in the summary unless a specific line creates the risk.

When commenting, include:

- The vulnerable data flow or missing control.
- The likely impact.
- A focused remediation that matches local patterns.
- The severity: `Critical`, `Required`, `Optional`, or `FYI`.

Do not post vague warnings such as "sanitize this" without naming the input, sink, and expected validation or encoding point.

## Output style

Start with high-confidence vulnerabilities. Avoid alarmism; explain exploitability and context.

Use this shape:

```markdown
Security Findings

- Critical: [file:line] Risk, impact, and fix.

Threat Model Notes

- Trust boundaries or assumptions that matter.

Verification

- Security checks, tests, audits, or limitations.
```

If no vulnerabilities are found, say so and list the surfaces reviewed.
