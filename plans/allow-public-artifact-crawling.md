# Allow Public Artifact Crawling

1. Inspect the current crawler directives and confirm the public artifact route prefixes.
   - Verify: `robots.txt` currently blocks all paths and the backend exposes both artifact URL families under `/api/public/v1/`.
2. Add narrowly scoped crawler exceptions for signed artifact and artifact-share URLs.
   - Verify: both public prefixes are allowed while the catch-all `Disallow: /` remains.
3. Run repository linting and tests.
   - Verify: `eslint --fix` and the test suite complete successfully.
