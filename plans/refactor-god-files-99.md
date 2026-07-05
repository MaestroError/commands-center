# Issue #99 — Split god-files along existing seams

Pure moves + import updates. No behavior changes. Tests stay green throughout.

## Progress

- [x] #3 `frontend/src/lib/api.ts` (2055) → `lib/api/{client,auth,system,settings,integrations,specialists,documents,tasks,files,conversations,terminal}.ts`; `api.ts` is now a barrel. Typecheck/lint/api tests/knip green.
- [x] #2 `backend/src/services/task-service.ts` (2800) → `task-service.ts` (69, barrel/assembly) + `task-service/{mappers,status,template-files,context,read-ops,crud-ops,template-ops,feedback-subtask-ops,run-ops}.ts` (all <500). Public interface unchanged; `TaskServiceRef` breaks the service back-ref cycle. Typecheck/lint/1044 tests/knip green.
- [x] #4 `backend/src/services/task-execution-service.ts` (1864) → `task-execution-service.ts` (1156) + `task-execution-service/{context,helpers,retry-policy,reply-flow,agent-drain}.ts`. Injected via ctx. Typecheck/lint/1044 tests/knip green.
- [x] #1 `frontend/src/pages/TasksPage.tsx` (4454) → 14-line wrapper + `pages/tasks/{task-helpers,TaskListPage,TaskBoard,TaskDetailPanel,TaskDetailSections,TaskTemplatesView,TaskTemplateFormPage,TaskFormPage,TaskArchiveView}` (all <1000). Typecheck/lint/131 tests/knip green. (handleBoardMove left as a TaskListPage closure — moving it to a hook is a behavior change, out of scope.)
- [x] #5 `IntegrationsPage.tsx` (2415) → main (841) + `pages/integrations/{integration-helpers,mcp-server-dialog,integration-dialogs,integration-icons}`. 28 tests green.
- [x] #5 `FileManagerPage.tsx` (1422) → main (785) + `pages/file-manager/{file-manager-dialogs,file-manager-panels,file-manager-helpers}`. 19 tests green.
- [x] #5 `TaskDetailPage.tsx` (1288) → main (581) + `pages/task-detail/{task-run-detail,task-detail-helpers}`. 12 tests green.
- [n/a] `SettingsPage.tsx` is 1163 (< ~1200) and untouched — left as-is.

## Acceptance

- No touched source file over ~1,200 lines.
- Public service interfaces unchanged (routes/tests untouched apart from imports).
- `pnpm release:check` + E2E green.
