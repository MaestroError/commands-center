# Proposal: persistent dev environment via HOME on the volume (opt-in)

Status: idea, not scheduled. Complements `plans/opencode-state-dir.md`, which solves
the core problem (OpenCode provider connections surviving rebuilds) with a scoped
setting. This proposal is the broader, opt-in "persistent dev environment" mode.

## Idea

Set `HOME=/workspace/.cc/home` for the container. Because every XDG default derives
from `$HOME` (`~/.config`, `~/.local/share`, `~/.cache`), one variable puts all
XDG-respecting tool state on the volume for free, plus the non-XDG majority:
`~/.ssh`, `~/.gitconfig`, `~/.npm`, shell history, `~/.local/bin`, language
toolchains. Anything users install or configure at the user level inside CC
terminals then survives container rebuilds.

## No app code changes required

This is a deployment-level switch, not a feature of CommandsCenter:

- Either instruct operators in docs to set `HOME=/workspace/.cc/home` in their
  deploy environment (e.g. Coolify env vars), or
- Set it in the `Dockerfile` (`ENV HOME=/workspace/.cc/home` works for `USER node`).

The only mechanical requirement is that the directory exists before tools use it.
Options: a `CMD`/entrypoint wrapper (`sh -c 'mkdir -p "$HOME" && exec ccenter …'`),
or a documented one-time `docker exec … mkdir -p /workspace/.cc/home` for existing
volumes. Baking `mkdir` into the image only seeds _fresh_ named volumes (Docker
copies image content into an empty named volume on first use); existing volumes
need the manual step.

Note: the CLI's default env-file path (`~/.cc/.env`) shifts with `HOME`, but the
Docker `CMD` passes an explicit `--cc-env-file /workspace/.cc/.env`, so container
deployments are unaffected.

## Bonus: persist user-level global npm installs

`npm i -g` normally writes to `/usr/local` (image layer, lost on rebuild and not
writable by the `node` user anyway). With `HOME` on the volume, set:

```
NPM_CONFIG_PREFIX=$HOME/.local
PATH=$HOME/.local/bin:$PATH
```

Then user-level `npm i -g <tool>` installs land under `$HOME/.local` and persist
across rebuilds. (System-level installs — `apt-get` → `/usr` — still belong in the
Docker image; a volume cannot sensibly shadow system paths.)

## Trade-offs to weigh before adopting

- Credentials (`~/.ssh`, `gh` tokens, npm tokens) move onto the persistent volume;
  volume backups/snapshots then contain secrets.
- Caches grow unbounded on the volume; needs cleanup guidance.
- Persisted state meets a newer image after each upgrade — version-skew bugs become
  possible (the OpenCode storage repair in
  `packages/backend/src/opencode/opencode-storage-repair.ts` is precedent for this
  class of issue).
- Affects every process in the container, which is exactly why it should stay a
  separate opt-in rather than being folded into `CC_OPENCODE_STATE_DIR`.

## If adopted

- Decide default-off vs. default-on in the Dockerfile (recommend default-off,
  documented in `docs/deploy-coolify.md` as an optional hardening/persistence step).
- Document interaction with `CC_OPENCODE_STATE_DIR`: the scoped variable still wins
  for OpenCode's own state because it is injected last into the child env.
- Test matrix: fresh named volume, existing volume, `docker exec` shell, CC terminal,
  task runs, and an image upgrade with persisted state.
