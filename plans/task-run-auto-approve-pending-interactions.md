# Task run auto-approve and pending interaction monitoring

## Todo

- [x] Make task-run `auto_approve` emit a broad OpenCode session allow rule.
- [x] Preserve explicit task/tool denies by placing them after the broad allow.
- [x] Keep human-question permissions denied for non-interactive task runs.
- [x] Add OpenCode pending permission/question list methods.
- [x] Have the task-run monitor fail/review a run when its OpenCode session has a pending permission or question.
- [x] Add focused backend tests for permission ordering and pending interaction handling.
- [x] Run eslint fix and relevant tests.
