---
name: self-skill-authoring
description: Create or revise OpenCode skills only for this specialist inside its own workspace. Use when the user wants this specialist to teach itself a reusable workflow, add a private local skill, improve its own .opencode/skills instructions, or capture a repeated behavior that should not become a global CommandsCenter workspace skill.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# self-skill-authoring

Use this skill when creating or updating a specialist-local OpenCode skill for this specialist only.

## Scope

- Create specialist-local skills under `.opencode/skills/<slug>/` in this specialist's workspace.
- Treat `.opencode/skills/` as private to this specialist. Other specialists will not receive these skills automatically.
- Use `global-skill-authoring` instead when the user wants a reusable CommandsCenter workspace skill that can be assigned to any specialist from the Skills page.
- Do not edit `.cc/workspace/skills/` when the user asks for a self-skill.

## Before writing

Clarify the local skill's intent before editing `SKILL.md`:

- What repeated workflow should this specialist remember?
- What user requests or task contexts should trigger the local skill?
- What output shape or behavior should the specialist produce?
- What examples, templates, references, or scripts would prevent repeated work?
- What local assumptions are safe because this skill is only for this specialist?

If the current conversation already contains the workflow, extract the answers from the conversation first. Ask the user only for gaps that materially affect the skill.

## Required structure

```text
.opencode/skills/<slug>/
  SKILL.md
  references/
  scripts/
  assets/
```

- `<slug>` must be lowercase kebab-case.
- `SKILL.md` must start with YAML frontmatter.
- The frontmatter `name` must exactly match the directory slug.
- Supporting folders are optional. Create only the files that the local skill actually needs.

## Minimum SKILL.md shape

```md
---
name: inbox-triage
description: Triage this specialist's incoming workspace notes and produce next actions. Use when the user asks this specialist to sort notes, identify follow-ups, or prepare a concise action list from copied messages.
---

# inbox-triage

Use this skill to triage copied workspace notes for this specialist.

## Workflow

1. Identify decisions, tasks, blockers, and unclear requests.
2. Group related items by project or owner.
3. Produce a concise action list with open questions at the end.
```

## Frontmatter guidance

- Keep `name` identical to the directory slug.
- Write `description` as the trigger surface. Include what the local skill does and the situations where this specialist should use it.
- Put "when to use this skill" details in `description`, not only in the body. The body is available only after the skill has already triggered.
- Do not add CommandsCenter-specific global metadata unless the user explicitly needs it for a compatibility experiment.

## Body guidance

- Write short, direct instructions in imperative form.
- Explain why a rule matters when that helps the specialist generalize.
- Prefer realistic examples over long explanation.
- Avoid brittle all-caps `MUST` or `NEVER` wording unless violating the rule would break the local workflow.
- Include local preferences, recurring user expectations, and specialist-specific context only when they are durable enough to reuse.
- Do not include background process notes, changelogs, or user-facing documentation that this specialist does not need at run time.

## Progressive disclosure

Keep `SKILL.md` focused on the core workflow and decision rules. Move details into supporting files when they would bloat the main skill:

- Use `references/` for domain docs, schemas, policies, or longer examples that should be read only when relevant.
- Use `scripts/` for deterministic or repetitive operations the specialist would otherwise rewrite.
- Use `assets/` for templates, images, boilerplate, or other files used in the final output.

Reference supporting files clearly from `SKILL.md`, including when to read or use them. Keep references shallow so this specialist can discover the right file without chasing many nested links.

## Examples

Include examples when they clarify triggering, output format, or workflow decisions:

```md
## Examples

**Example 1**
User asks: "Use our usual triage flow on these notes."
Use the skill to: Extract tasks, decisions, blockers, and open questions.

**Example 2**
User asks: "Make this match how you usually prep my release checklist."
Use the skill to: Follow the specialist's local release checklist workflow.
```

## Final sanity check

Before finishing a new or revised self-skill:

- Try 2-3 realistic prompts that should trigger the skill.
- Check that the `description` would make this specialist discover the skill for those prompts.
- Check that `SKILL.md` is concise enough to read quickly and complete enough to guide this specialist without hidden context.
- Check that every supporting file is referenced from `SKILL.md` or clearly part of a referenced folder.
- Confirm that the skill belongs only to this specialist. If it should be shared, suggest turning it into a CommandsCenter workspace skill instead.

## Next steps after authoring

When the self-skill is ready, tell the user it is available only to this specialist because it lives under this specialist's `.opencode/skills/` folder. If the user wants the same behavior for other specialists, suggest creating a global workspace skill with `global-skill-authoring` and assigning it from the CommandsCenter Skills page.

## Portability guidance

- Keep supporting templates, examples, scripts, and references next to `SKILL.md` so this specialist's workspace remains self-contained.
- Avoid absolute paths that point outside this specialist's workspace unless the user explicitly asks for a machine-local dependency.
- Never store secrets in skill instructions, examples, scripts, or assets.
