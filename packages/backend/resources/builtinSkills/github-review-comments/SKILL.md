---
name: github-review-comments
description: Address unresolved GitHub pull request review comments and requested changes. Use when asked to handle PR review feedback, review threads, unresolved comments, requested changes, or reviewer comments on a GitHub PR by deciding whether each comment should be fixed, answered, or clarified.
compatibility: opencode
metadata:
  category: quality
  version: 1.0.0
---

# github-review-comments

Use this skill to work through GitHub PR review feedback end to end. Treat every unresolved review thread as a decision that must be resolved by a code change, an explanation, or a follow-up question.

## Core workflow

1. Resolve the PR target.
   - If the user provided a PR URL, use it directly.
   - If the user refers to the current branch, identify the matching PR before reading comments.
2. Fetch thread-aware review data.
   - Prefer tools or GraphQL queries that expose review thread resolution state, file, line, author, and original comment context.
   - Do not rely only on flat comment lists when unresolved/resolved state matters.
3. List every non-resolved review comment or thread.
   - Skip resolved, outdated, duplicate, approval-only, and purely informational comments unless the user explicitly asks to revisit them.
   - Group repeated comments only when they clearly refer to the same underlying change.
4. Classify each non-resolved item before acting:
   - `Relevant:` the comment identifies a real bug, risk, unclear code, missing test, missing documentation, or requested improvement that fits the PR scope.
   - `Not relevant:` the comment is based on a misunderstanding, stale context, already-handled code, out-of-scope request, or a tradeoff that should intentionally remain.
   - `Ambiguous:` the comment lacks enough detail, conflicts with another requirement, or could be solved in multiple incompatible ways.
5. Act on each item using the matching rule below.

## Action rules

### Relevant comments

When a comment is relevant:

1. Implement the smallest appropriate fix.
2. Run focused validation for that fix.
3. Commit the fix separately from other unrelated review comments.
4. Reply to the review thread with what changed and the validation used.
5. Resolve the review thread after the fix is committed and pushed, when a review-thread resolve tool is available.

Use separate commits for independent review comments so reviewers can map each fix to its thread. Combine comments into one commit only when they require the same code change.

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

- Commit only files needed for the addressed review item.
- Use terse commit messages that name the fix, for example `Handle stale skill aliases`.
- Do not batch unrelated reviewer comments into a cleanup commit.
- If tests or formatting modify extra files, include them only when they are caused by the fix.
- Push after committing so GitHub thread resolution points at visible code.

## Safety

- Confirm GitHub authentication before attempting network or PR write actions.
- Do not resolve a thread before the fix, answer, or follow-up is posted.
- Do not mark a thread resolved when you are unsure.
- Do not force-push, rebase, squash, or rewrite PR history unless the user explicitly asks.
- If a comment requests a risky behavior change, explain the risk before editing.
- If comments conflict, stop and ask the user or reviewer which direction wins.

## Output style

Keep the user informed with a compact progress table:

```markdown
Review Threads

- Relevant: [file:line] Summary -> fixed in commit <sha>, validation: <check>, resolved.
- Not relevant: [file:line] Summary -> answered with rationale, resolved or left open.
- Ambiguous: [file:line] Summary -> asked follow-up question, left unresolved.
```

Final output should include:

- PR URL.
- Threads fixed, answered, and still waiting for clarification.
- Commits created.
- Tests or checks run.
- Any unresolved blockers.
