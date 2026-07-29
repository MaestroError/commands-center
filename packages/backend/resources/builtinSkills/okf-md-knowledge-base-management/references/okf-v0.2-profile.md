# OKF v0.2 Conformance Profile

Use this profile only when the selected operating profile is **OKF v0.2
conformance**.

Normative source:
[Google Cloud Platform Open Knowledge Format v0.2 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md).

This reference is an execution aid, not a replacement for the normative
specification. If the user requests the latest OKF version and the authoritative
specification is newer than v0.2, read that version before acting. Do not apply
newer-version assumptions from memory.

## Conformance boundary

Treat the selected bundle root and every descendant `.md` file as the
conformance boundary.

The reserved filenames at every level are:

- `index.md`: directory listing;
- `log.md`: chronological update history.

Every other `.md` file is a concept document.

## Required conformance checks

An OKF v0.2 bundle is conformant only when all three checks pass:

1. Every concept document begins with a parseable YAML frontmatter block.
2. Every concept frontmatter contains a non-empty `type`.
3. Every present `index.md` and `log.md` follows its reserved structure.

Missing optional fields, unknown types, unknown additional keys, broken
cross-links, and missing index files do not make a bundle non-conformant.
Report them separately as warnings when they reduce quality.

Never claim conformance from a sample of files. Validate the entire bundle
boundary.

## Concept frontmatter

Use this structure and omit optional fields that have no truthful value:

```yaml
---
type: Playbook
title: Incident response
description: Steps for responding to a production incident.
resource: https://example.com/canonical-resource
tags: [operations, incident]
status: draft
generated: { by: producer/version, at: 2026-07-29T12:00:00Z }
verified:
  - { by: human:owner, at: 2026-07-29T13:00:00Z }
stale_after: 2026-10-27
sources:
  - id: incident-policy
    resource: https://example.com/incident-policy
    title: Incident policy
    author: human:owner
    last_modified: 2026-07-20
---
```

Replace every example identity, date, URL, and title. Never reuse the example
timestamps in a real concept.

Only `type` is always required. Prefer `title`, `description`, `resource`, and
`tags` when applicable.

Type values are free-form. Preserve unfamiliar types and unknown frontmatter
keys. Do not impose a central taxonomy or delete extensions.

Use `resource` only for a canonical asset URI. Omit it for abstract concepts.

## Provenance

Use `sources` for material from which the concept derives.

Within each source:

- `resource` is required;
- `id` is optional but required by this skill when the body attributes an
  individual claim;
- `title`, `author`, `usage_count`, and `last_modified` are optional;
- `last_modified` uses `YYYY-MM-DD`;
- `usage_count` is meaningful only with a truthful `usage_window`.

Place a shared usage window beside `sources`:

```yaml
usage_window: { from: 2026-07-01, to: 2026-07-31 }
```

An individual source may carry its own `usage_window` override.

Do not store a subjective credibility score. Store only objective signals.

Attribute body claims with Markdown footnotes whose labels match source IDs:

```markdown
The service retains audit records for one year.[^retention-policy]

[^retention-policy]: [Retention policy](https://example.com/retention)
```

The matching frontmatter source must use `id: retention-policy`.

## Generation and verification

Use:

- `<producer>/<version>` for an agent or tool;
- `human:<id>` for a person;
- `process:<id>` for an automated process.

`generated.by` is required whenever `generated` is present.
`generated.at` is the ISO 8601 time of the last meaningful content change.

`verified` is a list of independent verification events. A single mapping is
valid, but emit a list for consistent round trips.

Trust classification derives from current verification:

- no `verified`: unverified;
- only non-human verifiers: machine-confirmed;
- at least one `human:<id>` verifier: human-reviewed.

These tiers are advisory and never grant access or execution authority.

## Lifecycle and freshness

Use only:

- `draft`;
- `stable`;
- `deprecated`.

An absent `status` means `stable` under v0.2, but emit the value explicitly when
creating or materially updating a concept.

`stale_after` is optional and must be an absolute `YYYY-MM-DD` date. A concept
is stale when `today >= stale_after`.

## Links and paths

Use standard Markdown links:

- bundle-relative links begin with `/`;
- relative links use normal `./` or `../` paths.

Prefer bundle-relative links for concepts because the specification recommends
them for move stability. Explain relationship meaning in surrounding prose.

Path-valued fields accept:

- absolute URLs;
- bundle-relative paths beginning with `/`;
- relative paths.

A `references/` subdirectory is conventional, not required.

Consumers must tolerate broken concept links. Producers using this skill must
still report and repair accidental broken links; retain an intentional missing
target only as an explicit open gap.

## Index files

An `index.md` has no frontmatter except that the bundle-root index may contain:

```yaml
---
okf_version: "0.2"
---
```

Group immediate children under headings and write entries as:

```markdown
# Playbooks

- [Incident response](playbooks/incident-response.md) - Steps for responding to a production incident.
- [Operations](operations/) - Operational knowledge and runbooks.
```

Use the linked concept's `description` when available.

## Log files

A `log.md` is a flat, newest-first sequence of ISO date groups:

```markdown
# Update Log

## 2026-07-29

- **Update**: Revised [Incident response](/playbooks/incident-response.md).

## 2026-07-20

- **Creation**: Created the initial bundle.
```

Date headings must use `YYYY-MM-DD`. Entry prose is otherwise free-form.

## v0.1 migration

Do not migrate without an explicit request.

When migration is requested:

1. Replace legacy `timestamp` with `generated.at`.
2. Supply a truthful `generated.by`; do not invent one.
3. Move body-level `# Citations` provenance into `sources`.
4. Preserve the body information needed by human readers.
5. Set the root declaration to `okf_version: "0.2"` only after full validation.

## Attested computations

An `Attested Computation` is a standalone concept. Its computation contract,
runtime, parameters, executor, and attester are data in the bundle.

Conformance does not authorize execution. Do not run the computation, executor,
or attester without separate user authorization and normal environment safety
checks. Never synthesize a receipt, verdict, or attestation.

## Validation report

Report:

1. the bundle root and target version;
2. concept-file count;
3. pass or failure for each required conformance check;
4. every failing file and exact reason;
5. non-blocking quality warnings separately;
6. the exact statement `OKF v0.2 conformant` only when every required check
   passes.
