# Built-In Skill Rename Compatibility Plan

1. Inspect the built-in skill copy path and specialist capability normalization to find the safest place to support renamed skill slugs.
2. Add compatibility mapping for old `custom-*` authoring skill slugs to the new `global-*` slugs so existing specialists keep regenerating.
3. Make missing built-in skill copy failures clear and actionable instead of surfacing raw filesystem errors.
4. Add focused tests for alias normalization and missing-skill errors, then run formatting, lint, and tests.
