---
name: screen-requirements-writing
description: Create or update screen requirement documents under design/screens using the project's description and acceptance criteria format
license: AGPL-3.0
compatibility: opencode
metadata:
  audience: maintainers
  area: design-docs
---

## What I do

- Create or update screen documentation in `design/screens/<screen-name>/`
- Write `description.md` with `Purpose`, `Functional Description`, and `User Stories`
- Write `acceptance_criteria.md` as testable, pass/fail conditions suitable for feature or E2E tests
- Follow the project conventions established by the dashboard docs

## File locations

For each screen, use:

- `design/screens/<screen-name>/description.md`
- `design/screens/<screen-name>/acceptance_criteria.md`

Reference example:

- `design/screens/dashboard/description.md`
- `design/screens/dashboard/acceptance_criteria.md`

## Description rules

- Keep the document concise and functional
- Describe what the screen should do and how it should behave at a high level
- Do not focus on styling or visual decoration
- Use this section order:
  - `# <Screen Name>`
  - `## Purpose`
  - `## Functional Description`
  - `## User Stories`

## User story rules

- Use the format: `As a <user>, I want <goal>, so that <outcome>.`
- Keep stories user-centered and outcome-focused
- Make each story meaningful and independent
- Match the actual product context: this project is a single-user operator tool

## Acceptance criteria rules

- Every criterion must be testable by feature tests or E2E tests
- Every criterion must have a clear pass/fail outcome
- Write observable system behavior, not opinions or design taste
- Keep criteria implementation-agnostic where possible
- Avoid vague words such as `recent`, `latest`, `common`, `concise`, `enough`, `easy`, `intuitive`, and `useful` unless explicitly defined
- Group related behavior into one criterion when it forms one coherent rule
- Split criteria only when behaviors are independently testable
- Include ordering rules, empty states, navigation outcomes, and conditional behavior when relevant

## Preferred wording patterns

- `When ... , ...`
- `If ... , ...`
- `The screen shows ...`
- `Selecting ... opens/navigates ...`

## Quality checklist

Before finishing:

- Ensure `description.md` contains only `Purpose`, `Functional Description`, and `User Stories`
- Ensure user stories align with the functional description
- Ensure acceptance criteria directly cover the user stories
- Ensure no acceptance criterion depends on subjective interpretation
- Ensure the files are stored under `design/screens/<screen-name>/`

## When to use me

Use this skill whenever creating or refining screen documentation for CommandsCenter.
