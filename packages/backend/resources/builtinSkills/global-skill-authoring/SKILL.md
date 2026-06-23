---
name: global-skill-authoring
description: Author or revise portable OpenCode skills that fit CommandsCenter's global workspace skill contract. Use when creating reusable workspace skills, improving existing global skill instructions, deciding what should go in SKILL.md, or helping a user make a skill available to multiple specialists.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# global-skill-authoring

Use this skill when creating or updating reusable workspace skills for CommandsCenter.

## Where workspace skills live

- Store reusable workspace skills under `.cc/workspace/skills/<slug>/`.
- Each skill directory must contain `SKILL.md` and may include any supporting files the skill references.
- CommandsCenter treats `.cc/workspace/skills/` as the source of truth.
- Specialist `.opencode/skills/` folders are generated copies. Edit the workspace skill source, not the generated specialist copy.

## Preferred workflow

1. Use the CommandsCenter skills page to create a workspace skill from a name and description.
2. Let CommandsCenter generate the folder and starter `SKILL.md`.
3. Open the new skill folder in the file manager.
4. Add the final instructions, examples, and any supporting files there.
5. Assign the skill to one or more specialists from the skills page or the Specialist editor.

## Before writing

Clarify the skill's intent before editing `SKILL.md`:

- What should this skill help a specialist do?
- What user requests, task contexts, or file types should trigger it?
- What output shape should the specialist produce?
- What examples, templates, references, or scripts would prevent repeated work?
- What edge cases or constraints would surprise a specialist without this skill?

If the current conversation already contains the workflow, extract these answers from the conversation first. Ask the user only for gaps that materially affect the skill.

## Required structure

```text
.cc/workspace/skills/<slug>/
  SKILL.md
  references/
  scripts/
  assets/
```

- `<slug>` must be lowercase kebab-case.
- `SKILL.md` must start with YAML frontmatter.
- The frontmatter `name` must exactly match the directory slug.
- Supporting folders are optional. Create only the files that the skill actually needs.

## Minimum SKILL.md shape

```md
---
name: release-planning
description: Plan and review release work for this workspace.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# release-planning

Use this skill to plan and review release work for this workspace.

## Workflow

1. Gather the release goal, target date, risks, and unfinished work.
2. Produce a release checklist grouped by ownership area.
3. Call out blockers, verification steps, and follow-up decisions.
```

## Frontmatter guidance

- Keep `name` identical to the directory slug.
- Write `description` as the trigger surface. Include what the skill does and the situations where it should be used.
- Put "when to use this skill" details in `description`, not only in the body. The body is available only after the skill has already triggered.
- Keep `compatibility: opencode` unless CommandsCenter changes the workspace skill contract.

## Body guidance

- Write short, direct instructions in imperative form.
- Explain why a rule matters when that helps the specialist generalize.
- Avoid brittle all-caps `MUST` or `NEVER` wording unless violating the rule would break the workflow.
- Prefer realistic examples over long explanation.
- Do not include background process notes, changelogs, or user-facing documentation that the specialist does not need at run time.

## Progressive disclosure

Keep `SKILL.md` focused on the core workflow and decision rules. Move details into supporting files when they would bloat the main skill:

- Use `references/` for domain docs, schemas, policies, or longer examples that should be read only when relevant.
- Use `scripts/` for deterministic or repetitive operations the specialist would otherwise rewrite.
- Use `assets/` for templates, images, boilerplate, or other files used in the final output.

Reference supporting files clearly from `SKILL.md`, including when to read or use them. Keep references shallow so a specialist can discover the right file without chasing many nested links.

## Examples

Include examples when they clarify triggering, output format, or workflow decisions:

```md
## Examples

**Example 1**
User asks: "Can you turn these launch notes into a release plan?"
Use the skill to: Create a checklist, identify blockers, and list verification steps.

**Example 2**
User asks: "Review this release plan before we ship."
Use the skill to: Check ownership, risk coverage, missing tests, and unresolved decisions.
```

## Final sanity check

Before finishing a new or revised skill:

- Try 2-3 realistic prompts that should trigger the skill.
- Check that the `description` would make the skill discoverable for those prompts.
- Check that `SKILL.md` is concise enough to read quickly and complete enough to guide a specialist without hidden context.
- Check that every supporting file is referenced from `SKILL.md` or clearly part of a referenced folder.

## Next steps after authoring

When the skill is ready, remind the user that workspace skills are global reusable sources until assigned. Suggest adding the new skill to the needed specialists from the CommandsCenter Skills page, or offer to add it for them when you have the required workspace tools.

## Portability guidance

- If the skill depends on templates or examples, keep those files next to `SKILL.md` so the whole skill stays portable.
- Do not edit generated specialist `.opencode/skills/` copies by hand because CommandsCenter rewrites them on save.
