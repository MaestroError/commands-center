# System Prompts — Overview & Shared Design

CC-defined system prompts that are composed and sent with **every** user message
(chat and task runs), rendered from code-shipped templates with `{{ DYNAMIC }}`
placeholders, editable in Settings, toggleable per-conversation, and inspectable
from the chat.

This document is the shared contract for the three implementation phases:

- [`01-phase-infra.md`](01-phase-infra.md) — System prompt service, code-shipped
  definitions, variable rendering, workspace persistence, filesystem migration.
- [`02-phase-chat.md`](02-phase-chat.md) — Sending prompts with each message,
  right-sidebar "System Prompts" tab with toggles, per-message "Show system
  prompts" modal.
- [`03-phase-settings.md`](03-phase-settings.md) — Settings tab with Monaco
  editors, variable pills, save / reset-to-default.

---

## Why this design (key findings)

OpenCode's `POST /session/{id}/message` accepts a top-level **`system?: string`**
field (SDK: `client.session.prompt({ system })`). Behaviour, verified in
`examples/opencode/packages/opencode/src/session/llm.ts:99-111`:

1. The `system` string is **additive** — it is appended _after_ the agent prompt
   and `AGENTS.md`, never replacing them.
2. It is applied **per message**: only the _most recent_ user message's `system`
   is included in a generation
   (`prompt.ts:1327`, `prompt.ts:1485`, `llm.ts:107`). Conversation history does
   **not** re-serialize past `system` fields
   (`message-v2.ts:777` only emits text/file/compaction/subtask parts).

**Consequence:** to keep CC's prompts in context across a whole conversation, CC
must send the composed `system` string on **every** prompt request. That is the
core of Phase 2.

### Relationship to `AGENTS.md` (decided)

CC has **no ownership** of `AGENTS.md` — the user may hand-edit it, and
specialists imported from outside CC may not have a CC-generated one at all. So
the Identity system prompt is CC's **own canonical** identity, sent via `system`
every turn, and **coexists** with whatever is in `AGENTS.md`. We accept the minor
duplication. We do **not** stop writing `AGENTS.md`; the existing workspace
contract (`packages/backend/src/opencode/workspace-contract.ts`) is unchanged.

---

## The four prompts

| id            | Title         | Scope  | Order | Optional | Danger | Default content theme                                  |
| ------------- | ------------- | ------ | ----- | -------- | ------ | ------------------------------------------------------ |
| `identity`    | Identity      | `both` | 10    | no       | yes    | Role, name, instructions wrapper (per-specialist vars) |
| `global-chat` | Global (Chat) | `chat` | 20    | no       | yes    | `cc_default` tools + general CC environment for chat   |
| `global-task` | Global (Task) | `task` | 20    | no       | yes    | `cc_default` tools + environment for task runs         |
| `additional`  | Additional    | `both` | 30    | yes      | no     | Empty by default; user's extra global instructions     |

- **Scope** selects which prompts apply: chat messages compose
  `scope ∈ {chat, both}`; task runs compose `scope ∈ {task, both}`.
- **Order** controls concatenation order in the composed `system` string.
- **Optional** (`additional`): empty default → contributes nothing until edited.
- **Danger**: shown with a "danger" note in Settings (editing these affects every
  specialist / core behaviour).

All four are **global** (one definition each, edited in Settings). Per-specialist
variance for Identity comes from `{{ SPECIALIST_* }}` placeholders, not separate
files. (Per-specialist additional prompts are explicitly out of scope.)

---

## Variable catalog (placeholders)

Placeholders use `{{ VAR }}` syntax (whitespace inside braces tolerated:
`{{VAR}}`, `{{ VAR }}`). Rendering replaces known variables; unresolved variables
for the current context (e.g. task vars in a chat) render to an empty string.

| Variable                        | Available in scope | Source                                             |
| ------------------------------- | ------------------ | -------------------------------------------------- |
| `{{ APP_NAME }}`                | all                | Constant `CommandsCenter`                          |
| `{{ CURRENT_DATE }}`            | all                | Server date at send time (ISO-8601)                |
| `{{ WORKSPACE_DIR }}`           | all                | `config.paths.workspaceDir`                        |
| `{{ SPECIALIST_NAME }}`         | all                | specialist row `name`                              |
| `{{ SPECIALIST_SLUG }}`         | all                | specialist row `slug`                              |
| `{{ SPECIALIST_ROLE }}`         | all                | specialist row `role`                              |
| `{{ SPECIALIST_INSTRUCTIONS }}` | all                | specialist row `instructions`                      |
| `{{ CC_DEFAULT_TOOLS }}`        | all                | Rendered list of `cc_default_*` tool names + descs |
| `{{ CONVERSATION_ID }}`         | all                | conversation id                                    |
| `{{ TASK_ID }}`                 | task               | task id (empty in chat)                            |
| `{{ TASK_TITLE }}`              | task               | task title (empty in chat)                         |
| `{{ TASK_RUN_ID }}`             | task               | task run id (empty in chat)                        |

`cc_default_*` tools currently: `cc_default_set_task_result`,
`cc_default_add_task_artifact`, `cc_default_mark_needs_human_review`.

Each prompt **definition declares** the subset of variables it supports
(`variables: string[]`). Settings renders exactly that subset as clickable pills.
The variable catalog (id → label, description, resolver) is a single registry so
new variables are added in one place.

---

## Code-shipped definition shape

Each prompt is **one definition file** under
`packages/backend/src/system-prompts/definitions/` exporting a
`SystemPromptDefinition`. Default body is an inline template literal in that file
(no runtime FS discovery / glob imports — the CLI is bundled into one file; see
`skills/write-filesystem-migration/SKILL.md`).

```ts
export type SystemPromptScope = "chat" | "task" | "both";

export type SystemPromptDefinition = {
  id: string; // stable key, e.g. "global-chat"
  title: string; // "Global (Chat)"
  description: string; // shown in Settings + sidebar
  scope: SystemPromptScope;
  order: number; // composition order
  optional: boolean; // true → empty default contributes nothing
  danger: boolean; // Settings danger note
  enabledByDefault: boolean; // per-conversation toggle default
  workspaceRelativePath: string; // "configuration/system-prompts/global-chat.md"
  variables: string[]; // subset of variable catalog ids
  defaultBody: string; // shipped default markdown/XML (with {{ }} vars)
};
```

A registry (`definitions/index.ts`) exports the ordered array. Adding a new
prompt = add one file + register it. Updating an existing prompt's default =
edit its `defaultBody` (propagates to anyone who has not customized it — see
resolution rule below).

---

## Workspace persistence & resolution

- Save path: `CC_WORKSPACE_DIR/configuration/system-prompts/<id>.md`.
  (`configuration/` is an existing runtime-config subdirectory:
  `runtime-config.ts:266`.)
- **Resolution rule:** if the workspace file exists, its content is the prompt
  body; otherwise fall back to the **code-shipped `defaultBody`**.
- **Save:** write the body to the workspace `.md` file (even when the body uses
  XML tags — always `.md`).
- **Reset to default:** delete the workspace file → resolution falls back to the
  shipped default.

**Portability:** user edits live as portable `.md` files; un-customized prompts
reproduce from code on any machine running the same CC version. Deleting the DB
loses nothing prompt-related. This satisfies the Portable Workspace Rule and
keeps defaults improvable via code (a key requirement). We therefore **do not
seed** default content into files — see the migration note in Phase 1.

---

## Composition (the `system` string)

`SystemPromptService.resolveAll(scope, ctx, overrides)`:

1. Select definitions where `def.scope === scope || def.scope === "both"`.
2. Drop ones disabled by `overrides` (per-conversation toggle map; default uses
   `enabledByDefault`).
3. Resolve each body (workspace file or default) and render its variables.
4. Drop entries whose rendered body is empty/whitespace (covers optional
   `additional`).
5. Sort by `order`, join with `\n\n`.

Returns both:

- `system: string` — the joined string for the OpenCode `system` field.
- `prompts: Array<{ id; title; renderedBody; enabled }>` — structured, for the UI
  and the per-message snapshot.

---

## Per-conversation toggles (decided: per-conversation)

- Stored in the **DB** `conversations` table as
  `system_prompt_overrides_json` (nullable JSON `Record<promptId, boolean>`).
  This is conversation runtime state — treated like "runtime history" in the
  Portable Workspace Rule (intentionally non-portable; resets to defaults on DB
  rebuild, which is acceptable degradation).
- Absent/`null` → every prompt uses its `enabledByDefault`.
- Task-run conversations have no toggle UI; they compose with defaults.

---

## Architecture summary (separate service, extensible)

```
packages/backend/src/system-prompts/
├── definitions/
│   ├── identity.ts          # SystemPromptDefinition (+ default body)
│   ├── global-chat.ts
│   ├── global-task.ts
│   ├── additional.ts
│   └── index.ts             # ordered registry
├── variables.ts             # variable catalog: id → {label, description, resolve}
├── render.ts                # {{ VAR }} replacement
├── types.ts                 # SystemPromptDefinition, scope, context types
└── system-prompt-service.ts # list / get / save / reset / compose
```

The service is dependency-injected like the other services (takes `config`,
reads/writes workspace files). Adding/updating prompts or variables is a
code-only change in this folder.
