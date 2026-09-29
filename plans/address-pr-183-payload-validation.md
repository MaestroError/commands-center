# Address PR 183 payload validation review

1. Add backend regressions for native MIME/signature mismatches and uninspectable
   data URLs, including the shared command attachment path.
2. Strictly decode non-empty base64 data URLs before attachment inspection and
   require valid signatures for native PNG, JPEG, GIF, WebP, and PDF parts.
3. Run focused backend tests, lint with fixes, typecheck, formatting, knip, and
   the strongest feasible broader test suite before committing and pushing.

Success means malformed or mismatched attachments become the existing omission
note, valid text and native attachments retain current behavior, and both prompt
and command requests use the same verified attachment conversion.
