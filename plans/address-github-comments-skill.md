# Address GitHub Comments Skill Implementation Plan

> **For agentic workers:** Execute this plan task by task, keeping the checklist and verification results current.

**Goal:** Rename the GitHub review-feedback skill and improve both review skills so they reason about complete invariants and report one actionable finding or fix per root cause.

**Architecture:** The canonical built-in skill resources define the agent workflows. A built-in slug alias preserves existing specialist configurations while the catalog exposes only the new name. Existing service and route tests cover compatibility and discovery without introducing a filesystem migration.

**Tech Stack:** Markdown skill resources, TypeScript, Vitest, pnpm, ESLint, Prettier

**Spec:** Operator-approved scope from the 2026-09-07 CommandsCenter session.

## Global Constraints

- Keep both skills general-purpose and independent of CommandsCenter-specific review policy.
- Consolidate related manifestations by root cause or invariant family.
- Preserve persisted specialist configurations that use `github-review-comments`.
- Target `staging` from an isolated branch and open a draft pull request.
- Add no dependencies and make no unrelated changes.

---

### Task 1: Preserve the renamed built-in skill contract

**Files:**

- Move: `packages/backend/resources/builtinSkills/github-review-comments/SKILL.md` to `packages/backend/resources/builtinSkills/address-github-comments/SKILL.md`
- Modify: `packages/backend/src/lib/builtin-skill-aliases.ts`
- Modify: `packages/backend/test/routes/specialists.test.ts`
- Modify: `packages/backend/test/services/specialist-service.test.ts`

- [ ] Rename the resource directory and update its slug, heading, and description.
- [ ] Add `github-review-comments` as an alias of `address-github-comments`.
- [ ] Update the catalog expectation to expose only `address-github-comments`.
- [ ] Extend the persisted-capability test to prove old and new slugs normalize, deduplicate, and copy the current resource.
- [ ] Run the focused route and service tests.

### Task 2: Strengthen root-cause review behavior

**Files:**

- Modify: `packages/backend/resources/builtinSkills/code-review/SKILL.md`
- Modify: `packages/backend/resources/builtinSkills/address-github-comments/SKILL.md`

- [ ] Make code review trace changed invariants through relevant callers, state boundaries, and failure modes.
- [ ] Require completing the review surface before grouping candidate findings by root cause.
- [ ] Make comment addressing assess all threads, group shared causes, and implement coherent in-scope fixes.
- [ ] Preserve evidence-based severity, scope control, thread safety, and concise output contracts.

### Task 3: Update active references and verify the change

**Files:**

- Modify: `plans/commands-center-automated-maintenance-pipeline.md`

- [ ] Replace the active skill reference with `address-github-comments`.
- [ ] Search for stale references and retain only intentional compatibility and test references.
- [ ] Run Prettier, `eslint --fix`, focused backend tests, type checking, and the broader required test suite.
- [ ] Review the complete diff and check for accidental files or secrets.
- [ ] Commit, push the branch, and open a draft pull request targeting `staging`.
