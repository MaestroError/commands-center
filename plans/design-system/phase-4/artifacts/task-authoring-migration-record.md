# Task Authoring Migration Record (DS-0404)

- Task: [DS-0404](../04-task-authoring.md)
- Scope: `TaskPromptComposer.tsx` and the shared authoring status treatment in `task-ui.tsx`.

## Decisions and deltas

- Raw palette occurrences: **9 → 0** across the authoring-owned files.
- Skill identity uses the application accent role; specialist mention identity uses the information role; warnings use the warning role.
- File, slash, skill, and specialist suggestion controllers were not replaced. Textarea focus, arrows, Enter/Escape, insertion, attachments, and prompt serialization stay domain-owned.
- Native scheduling/form controls and task payload/state code were not changed.

Verification is owned by task prompt/form unit coverage, `e2e/tasks/templates.spec.ts`, and `e2e/chat-mentions.spec.ts` for the shared insertion contract.
