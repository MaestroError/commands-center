# Permission picker consistency

- [x] Use existing permission buttons for CC task tools; keep specialist Ask.
- [x] Make CC and MCP groups collapsible, closed for tasks/templates and open
      for specialists by default. Preserve permissions when toggling visibility.
- [x] Update interaction tests and run lint, tests, typecheck, and design audit.

No persistence changes or workspace ignore changes are needed.

Validation: 35 affected unit/component tests and 5 built-app browser scenarios
passed. ESLint --fix, frontend typecheck, build, and design audit passed.
