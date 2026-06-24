---
name: code-review
description: Review code changes for correctness, maintainability, engineering quality, logical flaws, regressions, and fit with project conventions. Use when asked to review a pull request, diff, branch, implementation, refactor, bug fix, or agent-written code before merge or handoff.
compatibility: opencode
metadata:
  category: quality
  version: 1.0.0
---

# code-review

Use this skill to perform a practical engineering review. Prioritize issues that could break behavior, make future work harder, or violate the project's established patterns.

## Review workflow

1. Understand the requested change, intended behavior, and relevant project instructions.
2. Inspect the diff before judging style or architecture.
3. Read nearby code enough to understand local conventions and invariants.
4. Review tests first when they exist; use them to infer expected behavior.
5. Check implementation paths for correctness, edge cases, error handling, and state consistency.
6. Evaluate whether the design is simpler, clearer, and better integrated than plausible alternatives.
7. Verify the stated validation story: tests, typecheck, lint, manual checks, screenshots, or migrations.

## What to look for

- Behavior that does not match the task, API contract, schema, or UI expectation.
- Missing edge cases: empty input, nullish values, duplicate records, races, retries, partial failures, stale cache, pagination, and permission boundaries.
- Logical flaws hidden by passing tests.
- Tests that assert implementation details instead of user-visible behavior.
- New abstractions that do not pay for their complexity.
- Feature logic added to a shared layer when an owning domain module would be clearer.
- Duplicate or near-duplicate helpers instead of a canonical local utility.
- Silent fallbacks that hide unclear invariants.
- Files or functions growing past a readable size without decomposition.
- New dependencies that the existing stack or standard library could avoid.

## Severity

- `Critical:` Security issue, data loss, broken core behavior, or a merge blocker.
- `Required:` Actionable issue that should be fixed before merge.
- `Optional:` Improvement that is useful but not required for correctness.
- `Nit:` Small style or naming issue that is safe to ignore.
- `FYI:` Context only.

Use severity labels only when they help the author decide what to do. A review with two strong findings is better than a long list of weak comments.

## PR review comments

If the user provides a PR link and an appropriate review/comment tool is available, add concise line-level review comments directly on the PR for actionable findings. Prefer direct comments for `Critical` and `Required` issues. Keep optional or broad architectural notes in the summary unless a specific line is the right place to discuss them.

When adding review comments:

- Comment on code, not the author.
- Quote or reference only the smallest relevant code area.
- Explain the concrete risk and the expected fix.
- Avoid duplicating the same finding across many lines; comment once and mention the repeated pattern.
- Do not approve, request changes, resolve threads, or submit a final PR review unless the user explicitly asked for that action.

## Output style

Lead with findings, ordered by severity. Include file and line references whenever possible. If no issues are found, say that clearly and mention any remaining test or verification gaps.

Use this shape:

```markdown
Findings

- Required: [file:line] Clear problem, impact, and suggested fix.

Questions

- Any assumptions or missing context that affects confidence.

Verification

- What you checked or could not check.
```

Keep summaries short; the findings are the main output.
