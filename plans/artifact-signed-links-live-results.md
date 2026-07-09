# Artifact signed links and live results refresh

## Goal

Make the result-card "Create signed link" action visibly useful by returning both public render and download URLs, and refresh chat result artifacts without requiring a manual page reload.

## Steps

1. Extend the artifact share-link response shape to include `displayUrl` and `downloadUrl` while preserving the existing `url` field for compatibility.
2. Generate stateless signed public artifact display/download URLs from the artifact share-link service after publishing the artifact.
3. Update `ArtifactShareControls` to reveal both URLs with independent copy actions after generation.
4. Poll the visible chat results artifact query so newly registered artifacts appear live.
5. Update focused tests and run lint/typecheck/tests.
