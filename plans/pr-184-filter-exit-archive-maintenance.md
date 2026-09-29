# PR 184 Filter Exit Archive Maintenance

1. Add a panel regression that starts Mark read, changes the activity filter during the 180 ms exit, and verifies the archive request still starts.
2. Move timeout scheduling out of the card effect lifecycle while preserving the exit duration, reduced-motion behavior, and duplicate-request guard.
3. Run focused frontend tests, lint with fixes, typecheck, formatting, and whitespace checks before pushing the focused maintenance commit.
