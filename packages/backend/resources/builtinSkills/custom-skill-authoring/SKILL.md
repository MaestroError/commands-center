---
name: custom-skill-authoring
description: Author portable OpenCode skills that fit CommandsCenter's workspace skill contract.
compatibility: opencode
metadata:
  category: workflow
  version: 1.0.0
---

# custom-skill-authoring

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

## Required structure

```text
.cc/workspace/skills/<slug>/
  SKILL.md
  optional-example.md
  optional-template.txt
```

- `<slug>` must be lowercase kebab-case.
- `SKILL.md` must start with YAML frontmatter.
- The frontmatter `name` must exactly match the directory slug.

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

Explain what the skill should do, when to use it, and how it should behave.
```

## Guidance

- Keep the description short and action-oriented.
- Put durable instructions in the body, not only in frontmatter.
- If the skill depends on templates or examples, keep those files next to `SKILL.md` so the whole skill stays portable.
- Do not edit generated specialist `.opencode/skills/` copies by hand because CommandsCenter rewrites them on save.
