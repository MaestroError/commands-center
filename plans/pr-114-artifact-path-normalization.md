# PR 114 Artifact Path Normalization

## Goal

Normalize Windows-style artifact paths before filesystem resolution and reject
Windows absolute paths.

## Tasks

1. [completed] Normalize validated artifact paths to portable `/` separators
   and reject Windows drive-letter paths.
2. [completed] Add regression coverage for a Windows-style private Documents
   artifact path.
3. [completed] Run checks, push the fix, and resolve the review thread.
