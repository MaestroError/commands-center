# Recheck Native Open Knowledge Format Support

**Status:** Deferred until the Open Knowledge Format reaches at least v0.5.
Authored 2026-07-29.

## Context

CommandsCenter is not implementing native Open Knowledge Format packaging,
manifests, ABI declarations, execution, attestations, or trust semantics while
the format remains earlier than v0.5. The specification and ecosystem are still
young enough that a native data model would create avoidable compatibility,
migration, editor, and security commitments.

The interim built-in
`packages/backend/resources/builtinSkills/okf-md-knowledge-base-management/SKILL.md`
is a platform-neutral skill for managing any Markdown knowledge base. It
applies portable files, hierarchical organization, progressive-disclosure
indexes, typed knowledge records, explicit links, provenance, lifecycle,
verification, and freshness. It does not provide native CC document-format
support. Its optional OKF v0.2 profile applies only when the underlying host
preserves conformant Markdown and YAML frontmatter.

Primary references:

- [Open Knowledge Format specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
- [Google Cloud announcement and overview](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)

## Recheck Trigger

Reassess native support only when all of the following are true:

1. The official OKF specification publishes version v0.5.0 or later.
2. The v0.5+ specification defines sufficiently stable package, manifest,
   identity, link, lifecycle, and compatibility semantics for persisted use.
3. The reference tooling can read and validate packages without requiring CC
   to execute untrusted computation.

Also recheck before a broad redesign of the CC Documents storage model, rich
Markdown editor, document import/export, or workspace portability contract.

## Reassessment Checklist

1. Read the authoritative v0.5+ specification, schemas, changelog, reference
   implementation, conformance tests, and security guidance.
2. Compare the stable specification with CC's current Markdown files, registered
   metadata, editor behavior, global/private scopes, link rendering, search,
   import/export, and Portable Workspace Rule.
3. Decide separately whether CC should support:
   - importing an OKF package as inert knowledge;
   - exporting CC documents as an OKF package;
   - authoring and validating OKF metadata;
   - displaying provenance, lifecycle, compatibility, and trust information;
   - executing attested computation.
4. Require a separate threat model and explicit operator approval before
   supporting executable content, capability requests, dependency installation,
   signatures, attestations, or remote resolution.
5. Preserve generic Markdown document compatibility and define a reversible
   migration path for any new persisted metadata.
6. Confirm all portable configured state remains recoverable from workspace
   files on a fresh machine.
7. Create a persisted implementation plan only after the adoption decision is
   made.
8. Keep the platform-neutral built-in skill independent of CC's native
   implementation. Update its optional conformance reference when the
   authoritative specification changes.

## Completion Condition

Mark this check complete only after CC either ships verified native support for
a stable OKF v0.5+ contract or records a new explicit decision not to implement
native support.
