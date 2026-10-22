# Manual acceptance fixtures — 2026-10-22

- [x] Launch frontend on 4175 and backend on 3000 using the existing local workspace.
- [x] Create dedicated permission-test specialists using the existing provider and Notion connection.
- [x] Create manual tasks for inherited Ask, explicit Deny, and explicit Allow.
- [x] Create a template for permission-copy and reset tests.
- [x] Verify saved fixtures and document links, prompts, and expected results.

Use a read-only Notion lookup. Do not run tasks automatically or schedule recurrence.
Keep existing specialists and tasks unchanged. Fixture creation uses application
flows; no schema, application source, or workspace ignore changes are required.

## Prepared fixtures

All use `openai/gpt-6-sol`, the existing Notion integration, and two probes:
`notion-get-self` and `cc_specialist_management_list_models`. Other configurable
Notion tools and the other tools in the specialist-management group are denied.
Existing specialists/tasks were not edited. All four tasks were verified as
backlog, unscheduled, and with no runs. The template has no recurrence and its
public MCP sync/async tools are disabled.

### 1. Chat defaults

Open a fresh chat with each specialist:

- [E2E Permissions Ask](http://127.0.0.1:4175/chat/e2e-permissions-ask)
- [E2E Permissions Allow](http://127.0.0.1:4175/chat/e2e-permissions-allow)
- [E2E Permissions Deny](http://127.0.0.1:4175/chat/e2e-permissions-deny)

Send: `Call notion-get-self once with {}. Report whether it succeeded, without
printing email addresses or IDs. If unavailable or denied, stop; do not use a
fallback.`

Then independently send: `Call cc_specialist_management_list_models once and
report whether it succeeded. If unavailable or denied, stop; do not use a fallback.`

Ask should pause for approval; choose Allow Once. Allow should execute directly.
Deny should not execute successfully. Inspect actual tool-call cards/results,
not just the assistant's claims. Empty data is still a successful call; an auth
or provider error is an environment failure, not a permissions pass.

### 2. Autonomous behavior

Open each task and click Queue once; the saved prompt requests both probes.

| Task                                                                                   | Expected                                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [E2E 01 - Inherited Ask](http://127.0.0.1:4175/tasks?task=01M5HXS03XFSWGZ061G0Y0SXSC)  | Both succeed without approval.                             |
| [E2E 02 - Explicit Deny](http://127.0.0.1:4175/tasks?task=01M5HXT3Z1M1NJR0EPXZ1KYSD8)  | Both blocked, although its specialist allows them in chat. |
| [E2E 03 - Explicit Allow](http://127.0.0.1:4175/tasks?task=01M5HXTKZFHJX6ZVRBHN5FRJ14) | Both succeed, although its specialist denies them in chat. |

Task completion alone does not prove permission behavior: a blocked probe may
still produce a successful final report. Check the individual calls.

### 3. Template snapshot

In [Templates](http://127.0.0.1:4175/tasks?view=templates), edit
`E2E 04 - Permission Snapshot Template`. Both probes initially have Allow
overrides. Its already generated
[task #M1](http://127.0.0.1:4175/tasks?task=01M5HXVGF8ZXX9EHS3CZ1XSX0Z)
has the same overrides.

Change the template's probes to Deny and save. Reopen #M1: its probes must still
be Allow. Use Create task on the template (not Run now) to generate #M2; it must
have Deny. Queue #M1 to verify its copied Allow permissions.

### 4. Reset overrides

After testing E2E 03, edit it, turn off Change available tools, and save. A new
run should inherit its Deny specialist defaults and block both probes. Repeat
the toggle/reset check on the template if desired. Refresh to verify persistence.

### 5. UI checks

In a test specialist editor, check per-tool Allow/Ask/Deny. The Notion tool list
belongs inside its server card, hides for None/Disabled, and expands/collapses
for Ask/Allow. Restore the server to Ask before running the prepared cases.
Task/template controls must offer only Allow/Deny and cannot connect servers.

The additional context, unavailable-tool, and active-run isolation scenarios
remain in `embedded-cc-tools-manual-e2e.md`; these fixtures are also usable for
those tests. No acceptance runs have been executed during setup.
