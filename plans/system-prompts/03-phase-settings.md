# Phase 3 — Settings: Editing System Prompts

Add a **System Prompts** tab to the Settings page where the operator edits each
prompt's template body in the same Monaco editor used by the file manager, with
clickable variable **pills**, save, and reset-to-default. Danger notes on the
global + identity prompts.

Depends on Phase 1's CRUD API (`GET/PUT/DELETE /api/system-prompts`,
`GET /api/system-prompts/:id`). Read [`00-overview.md`](00-overview.md).

---

## Layout & ordering

New tab in `SettingsPage.tsx` (`tabs` array + render switch), id
`system-prompts`, label "System Prompts". Cards render in this order (per spec):

1. **Additional** (optional) — first.
2. **Global (Chat)** — danger.
3. **Global (Task)** — danger.
4. **Identity** — danger.

> Order in Settings is presentation-only (Additional first as requested). It is
> independent of the **composition** `order` field from Phase 1 (Identity → Global
> → Additional), which governs what the model sees.

Each card is an expandable editing area (collapsed by default; expand one at a
time or independently). Header: title, "Customized"/"Default" badge
(`isCustomized`), and a **danger note** for danger prompts ("Editing this affects
every specialist and core behaviour.").

---

## Tasks

### 3.1 — Data & client

- [ ] `hooks/use-system-prompts-query.ts`:
  - `useSystemPromptsQuery()` → `GET /api/system-prompts` (definitions + variable
    catalog + `isCustomized` per prompt).
  - `useSystemPromptQuery(id)` → `GET /api/system-prompts/:id`
    (`{ definition, body, defaultBody, isCustomized }`), loaded when a card
    expands.
  - `useSaveSystemPromptMutation(id)` → `PUT` body.
  - `useResetSystemPromptMutation(id)` → `DELETE`.
- [ ] `lib/api.ts`: `getSystemPrompts`, `getSystemPrompt`, `saveSystemPrompt`,
      `resetSystemPrompt`.

### 3.2 — Variable pills

- [ ] `components/settings/SystemPromptVariablePills.tsx`: render each variable
      the prompt declares (`definition.variables`) as a pill showing
      `{{ VAR }}` with a tooltip from the catalog `description`.
  - Click → copy the **insertable token** `{{ VAR }}` to clipboard
    (`navigator.clipboard.writeText`).
  - Clear copied feedback: pill briefly swaps to a check + "Copied" (mirror the
    pattern in `MessageTimeline.tsx` `MessageCopyButton` / `CopyIdButton.tsx`).
  - (Insert-at-cursor is a possible enhancement; copy-to-clipboard is the
    required behaviour.)

### 3.3 — Editor card

- [ ] `components/settings/SystemPromptCard.tsx`:
  - Expand/collapse; on first expand, fetch the body.
  - **Reuse `components/workspace/MonacoFileEditor.tsx`** (the file-manager
    editor). Drive it as a controlled editor:
    - `name="<id>.md"`, `mimeType="text/markdown"` so it highlights markdown;
      XML tags inside are fine (we always store `.md`).
    - `draft` = local edit state, `baseline` = loaded body, `dirty` =
      `draft !== baseline`, `isWritable=true`.
    - `onSaveRequested` → `PUT`; on success update baseline + invalidate
      `isCustomized`.
    - `onReloadRequested` → refetch body.
    - Conflict props are unused here (single-operator, no revisions) — pass
      `undefined`; if `MonacoFileEditor`'s required props make this awkward,
      extract its inner editor into a smaller shared presentational component
      rather than forking it.
  - Variable pills (3.2) shown above the editor.
  - Footer: **Save** (disabled unless dirty), **Reset to default** (danger;
    confirm dialog — reuse the `ConfirmDialog` pattern already in
    `SettingsPage.tsx`). After reset, reload shows the shipped default and the
    badge flips to "Default".
  - For **Additional**: empty is valid (no non-empty validation); show a hint
    that an empty additional prompt is simply not sent.

### 3.4 — Settings tab assembly

- [ ] `components/settings/SystemPromptsTab.tsx`: fetch the list, render the four
      `SystemPromptCard`s in the order above, surface load/error/empty states
      with the shared `PageStates` components.
- [ ] Register the tab in `SettingsPage.tsx`.
- [ ] Phase 2's "Edit in Settings" link deep-links here (route/tab selection).

---

## Editor reuse note

`MonacoFileEditor` currently couples save/reload/conflict to the file-manager
revision model. Preferred approach: pass plain controlled props and ignore
conflict handling. If coupling is too tight, **extract** the Monaco wrapper
(language guess + editor + keyboard save) into a shared
`components/common/CodeEditor.tsx` and have both the file manager and this tab use
it. Decide during implementation; keep the change minimal and DRY.

Markdown / txt / XML editing is covered by Monaco's `markdown` language; files are
always persisted as `.md` (the backend writes `<id>.md` regardless of XML content
— Phase 1).

---

## Files touched / added

**Added**

- `components/settings/SystemPromptsTab.tsx`
- `components/settings/SystemPromptCard.tsx`
- `components/settings/SystemPromptVariablePills.tsx`
- `hooks/use-system-prompts-query.ts`
- (maybe) `components/common/CodeEditor.tsx` (extracted editor)

**Edited**

- `pages/SettingsPage.tsx` (new tab)
- `lib/api.ts` (client fns)

No backend changes (Phase 1 API is sufficient).

---

## Tests

- `SystemPromptsTab.test.tsx` — renders four cards in the required order; danger
  note only on global + identity; Additional first.
- `SystemPromptCard.test.tsx` — expand fetches body; edit → dirty → Save calls
  `PUT` and clears dirty; Reset confirms then calls `DELETE` and shows default;
  Additional allows empty.
- `SystemPromptVariablePills.test.tsx` — only declared variables shown; click
  copies `{{ VAR }}` and shows "Copied" feedback.
- Hooks tested via component tests with a mocked API.

---

## Exit criteria

- Settings → System Prompts lists Additional, Global (Chat), Global (Task),
  Identity with correct badges and danger notes.
- Editing + Save writes `configuration/system-prompts/<id>.md`; the chat sidebar
  (Phase 2) and modal reflect the new content on the next message.
- Reset to default removes the file and restores the shipped body.
- Variable pills copy `{{ VAR }}` with clear feedback.
- Lint, typecheck, frontend tests green.
