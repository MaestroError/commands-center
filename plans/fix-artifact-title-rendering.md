# Fix Artifact Title Rendering

## Assumptions

- Artifact titles are the user-facing label for artifact links.
- Artifact links/paths should remain visible as secondary metadata.
- The task board panel and task detail page should render artifact titles consistently.

## Tasks

- [x] Update task board artifact cards and run attachments to use `artifact.title` as the link label.
- [x] Update task detail artifact cards and run attachments to use `artifact.title` as the link label.
- [x] Adjust tests to cover title-first rendering, including URL artifacts whose final path segment is not the title.
- [x] Run `eslint --fix` and relevant tests before committing.
- [ ] Commit, push, and open a pull request.
