# Settings, API, and Tools Migration Record (DS-0407)

- Task: [DS-0407](../07-settings-api-tools.md)

## Decisions and deltas

- Raw palette occurrences: **27 → 0** across `SettingsPage.tsx` and `CustomToolsPage.tsx`.
- Success, warning, danger, and drift states use semantic roles. Ordinary native selects, checkboxes, and radios remain native.
- The demonstrated API permission-group tri-state is migrated to the CC-owned `components/ui/checkbox.tsx`, backed by Radix Checkbox. Checked/unchecked/indeterminate state is controlled by `ApiPage`; permission logic remains outside the primitive.
- Checkbox unit coverage and primitive-gallery interaction coverage were added. No token security, settings persistence, filesystem behavior, API payload, or confirmation flow changed.

Verification is owned by API/settings/tool unit coverage, `e2e/custom-tools.spec.ts`, and the Phase 4 full gate.
