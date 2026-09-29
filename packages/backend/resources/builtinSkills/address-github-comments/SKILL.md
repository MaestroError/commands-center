---
name: address-github-comments
description: Address unresolved GitHub pull request review comments and requested changes. Use when asked to handle PR review feedback, review threads, unresolved comments, requested changes, or reviewer comments on a GitHub PR by assessing every thread, grouping shared root causes, and deciding what should be fixed, answered, or clarified.
compatibility: opencode
metadata:
  category: quality
  version: 1.1.0
---

# address-github-comments

Use this skill to work through GitHub PR review feedback end to end. Treat every unresolved review thread as a decision that must be resolved by a code change, an explanation, or a follow-up question.

## Core workflow

1. Resolve the PR target.
   - If the user provided a PR URL, use it directly.
   - If the user refers to the current branch, identify the matching PR before reading comments.
2. Fetch thread-aware review data.
   - Prefer tools or GraphQL queries that expose review thread resolution state, file, line, author, and original comment context.
   - Do not rely only on flat comment lists when unresolved/resolved state matters.
3. List every non-resolved review comment or thread before editing.
   - Skip resolved, outdated, duplicate, approval-only, and purely informational comments unless the user explicitly asks to revisit them.
4. Classify each non-resolved item before acting:
   - `Relevant:` the comment identifies a real bug, risk, unclear code, missing test, missing documentation, or requested improvement that fits the PR scope.
   - `Not relevant:` the comment is based on a misunderstanding, stale context, already-handled code, out-of-scope request, or a tradeoff that should intentionally remain.
   - `Ambiguous:` the comment lacks enough detail, conflicts with another requirement, or could be solved in multiple incompatible ways.
5. Group items only when evidence shows that they share a violated invariant, underlying cause, or corrective action.
6. For each relevant group, trace the concern through the changed code, adjacent callers, tests, and applicable transaction, concurrency, retry, partial-failure, compensation, persistence, and cache boundaries.
7. Define the smallest complete in-scope fix for the root cause. Include related manifestations that would otherwise leave the invariant broken; exclude unrelated pre-existing issues.
8. Act on each group and item using the matching rules below, then account for every original thread in the final disposition.

## Action rules

### Relevant comments

When a comment is relevant:

1. Implement the smallest complete fix for the underlying cause, not only the literal example in the comment.
2. Update or add tests that exercise the invariant and meaningful related failure paths when a viable test structure exists.
3. Run focused validation for the full root-cause group.
4. If the user has asked you to commit and push, commit the group separately from unrelated causes; otherwise ask for approval before committing.
5. Reply to every affected review thread with what changed, where related manifestations were handled, and the validation used.
6. Resolve each review thread after the fix is committed and pushed, when a review-thread resolve tool is available.

Use separate commits for independent root causes so reviewers can map each fix to its threads. Combine comments when one coherent change is required to restore the shared invariant.

### Not relevant comments

When a comment is not relevant:

1. Do not change code just to satisfy the comment.
2. Reply to the thread with a concise explanation and evidence.
3. Reference the code, product requirement, test, or existing behavior that makes the comment not applicable.
4. Resolve the thread if the explanation fully answers the concern and a review-thread resolve tool is available.

Keep the tone collaborative. Explain the reasoning, not why the reviewer was wrong.

### Ambiguous comments

When a comment is ambiguous:

1. Do not guess.
2. Ask a focused follow-up question on the review thread.
3. State the specific decision or missing context needed.
4. Leave the thread unresolved until the reviewer responds or the user gives direction.

If ambiguity blocks several comments, ask one clear question that covers the shared decision.

## Commit discipline

- Before committing or pushing, ask the user for approval.
- Commit only files needed for the addressed root-cause group.
- Use terse commit messages and do not batch unrelated causes.
- If tests or formatting modify extra files, include them only when they are caused by the fix.
- Push after committing so GitHub thread resolution points at visible code.

## Safety

- Confirm GitHub authentication before attempting network or PR write actions.
- Do not resolve a thread before the fix, answer, or follow-up is posted.
- Do not mark a thread resolved when you are unsure.
- Do not patch one manifestation when evidence shows the same in-scope defect remains elsewhere.
- Do not expand a fix into unrelated cleanup merely because adjacent code was inspected.
- Do not force-push, rebase, squash, or rewrite PR history unless the user explicitly asks.
- If a comment requests a risky behavior change, explain the risk before editing.
- If comments conflict, stop and ask the user or reviewer which direction wins.

## Output style

Keep the user informed with a compact progress table:

```markdown
Review Threads

- Relevant: [file:line] Root cause and affected threads -> fixed in commit <sha>, validation: <check>, resolved.
- Not relevant: [file:line] Summary -> answered with rationale, resolved or left open.
- Ambiguous: [file:line] Summary -> asked follow-up question, left unresolved.
```

Final output should include:

- PR URL.
- Threads fixed, answered, and still waiting for clarification.
- Commits created.
- Tests or checks run.
- Any unresolved blockers.
