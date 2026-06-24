---
name: code-simplification
description: Simplify working code without changing behavior. Use when refactoring for clarity, reducing unnecessary complexity, removing duplication, untangling conditionals, improving names, or reviewing code that works but is harder to understand, maintain, or extend than it should be.
compatibility: opencode
metadata:
  category: quality
  version: 1.0.0
---

# code-simplification

Use this skill to make code easier to understand while preserving exact behavior. Simpler means lower cognitive load, not merely fewer lines.

## Ground rules

- Preserve behavior, public contracts, side effects, error behavior, and ordering.
- Follow the project's local conventions over generic preferences.
- Simplify only the requested or recently changed area unless the user explicitly broadens scope.
- Do not mix simplification with feature work unless the simplification is required to implement the feature safely.
- Do not remove error handling, validation, logging, or tests because they look noisy.
- Prefer deleting unnecessary concepts over moving the same complexity somewhere else.

## Simplification workflow

1. Understand the code before changing it: callers, side effects, edge cases, and tests.
2. Identify the smallest simplification that improves comprehension.
3. Make one coherent change at a time.
4. Run the relevant tests after risky changes.
5. Stop if the new version is not clearly easier to read or review.

## Common opportunities

- Deep nesting that can become guard clauses or named predicates.
- Long functions with multiple responsibilities.
- Nested ternaries or chained boolean expressions that need named decisions.
- Repeated conditionals that suggest a clearer model, helper, or dispatcher.
- Generic names such as `data`, `value`, `result`, or `temp` where the domain concept is known.
- Dead code, unused imports, commented-out code, and pass-through wrappers.
- Single-use abstractions that obscure the direct flow.
- Duplicate logic that can share a well-named helper.
- Type assertions or optional fallbacks that hide an unclear invariant.

## What not to do

- Do not chase line count.
- Do not rewrite a module only because it is old.
- Do not introduce a new framework, dependency, or pattern to simplify local code.
- Do not simplify code you cannot explain.
- Do not change tests to match a new behavior unless the user asked for a behavior change.
- Do not perform broad drive-by cleanup.

## PR review comments

If the user provides a PR link and an appropriate review/comment tool is available, add direct line-level comments for simplification issues that materially affect maintainability. Prefer comments for concrete problems such as tangled conditionals, duplicated logic, or unclear abstractions. Keep subjective style preferences in the summary or omit them.

When commenting, describe the simpler move:

- "Extract this decision into a named predicate."
- "Collapse these duplicate branches into one flow."
- "Move feature-specific logic back to the owning module."
- "Delete this wrapper and call the canonical helper directly."

## Output style

When proposing changes, explain the preserved behavior and the simplification benefit. When reviewing, lead with the highest-leverage simplification.

Use this shape:

```markdown
Simplification Opportunities

- Required/Optional: [file:line] Current complexity, simpler move, and behavior-preservation note.

Verification

- Tests or checks needed to prove behavior stayed the same.
```

If the code is already clear enough, say so and avoid inventing churn.
