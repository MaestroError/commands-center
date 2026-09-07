---
name: code-review
description: Review code changes for correctness, maintainability, engineering quality, logical flaws, regressions, and fit with project conventions. Use when asked to review a pull request, diff, branch, implementation, refactor, bug fix, or agent-written code before merge or handoff, especially when related symptoms should be consolidated by root cause.
compatibility: opencode
metadata:
  category: quality
  version: 1.1.0
---

# code-review

Use this skill to perform a practical engineering review. Prioritize issues that could break behavior, make future work harder, or violate the project's established patterns.

## Review workflow

1. Understand the requested change, intended behavior, review scope, and relevant project instructions.
2. Inspect the complete diff before judging style or architecture. Read tests early when they exist to infer expected behavior.
3. Identify each changed invariant: what must remain true before, during, and after the changed operation.
4. Trace those invariants through relevant callers and boundaries. Include transaction ownership, concurrency, retries, partial failures, compensation, persistence, and cache consistency when the change can affect them.
5. Read enough adjacent code to distinguish a local symptom from a shared cause and to understand established conventions.
6. Check implementation paths for correctness, edge cases, error handling, state consistency, and behavioral regressions.
7. Complete the review of the requested surface before drafting findings. Then cluster candidate issues that share an invariant or corrective action.
8. Validate each cluster against the code and tests, assign evidence-based severity, and discard speculative concerns without a concrete impact.
9. Verify the validation story: tests, typecheck, lint, manual checks, screenshots, or migrations.

## Root-cause consolidation

- Report one finding for one underlying defect, even when it appears at several lines or causes several symptoms.
- Anchor the finding at the clearest location and cite other affected paths in the explanation.
- Describe the invariant being violated, the observable impact, and the complete in-scope correction.
- Keep findings separate when they require independent fixes, have materially different impacts, or do not share a demonstrated cause.
- Do not broaden the review into unrelated pre-existing code. Inspect adjacent code only as far as needed to establish impact and fix scope.

## What to look for

- Behavior that does not match the task, API contract, schema, or UI expectation.
- Missing edge cases: empty input, nullish values, duplicate records, races, retries, partial failures, stale cache, pagination, and permission boundaries.
- Split ownership of one state transition across callers, helpers, transactions, queues, or cleanup paths.
- Failure handling that restores only part of the state or makes retries unsafe.
- Logical flaws hidden by passing tests.
- Tests that cover a reported example but not the invariant or related failure paths.
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

Use severity labels only when they help the author decide what to do. Base severity on demonstrated impact and reachability, not the number of affected lines. A review with two consolidated findings is better than a long list of repeated symptoms.

## PR review comments

If the user provides a PR link and an appropriate review/comment tool is available, add concise line-level review comments directly on the PR for actionable findings. Prefer direct comments for `Critical` and `Required` issues. Keep optional or broad architectural notes in the summary unless a specific line is the right place to discuss them.

When adding review comments:

- Comment on code, not the author.
- Quote or reference only the smallest relevant code area.
- Explain the violated invariant, concrete risk, and expected fix.
- Comment once per root cause at the most representative line and mention other affected locations instead of duplicating the finding.
- Do not approve, request changes, resolve threads, or submit a final PR review unless the user explicitly asked for that action.

## Output style

Lead with findings, ordered by severity. Include file and line references whenever possible. If no issues are found, say that clearly and mention any remaining test or verification gaps.

Use this shape:

```markdown
Findings

- Required: [file:line] Root cause or violated invariant, affected paths, impact, and complete in-scope fix.

Questions

- Any assumptions or missing context that affects confidence.

Verification

- What you checked or could not check.
```

Keep summaries short; the findings are the main output.
