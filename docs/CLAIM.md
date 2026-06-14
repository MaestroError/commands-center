# Setup

## Owner Claiming

CommandsCenter is a single-owner app. The first browser to claim a workspace becomes the owner for that workspace. Owner auth state is stored inside the workspace at `auth/owner-access.json`, for example `.cc/workspace/auth/owner-access.json` in local development.

Claim and reclaim codes are shown only when generated. They are stored only as hashes in the workspace auth file. Do not paste claim codes into committed files, issue trackers, chat logs, or shell history you do not control.

## Local Development Claiming

Start the app:

```bash
pnpm dev
```

Generate a claim code from the project root:

```bash
pnpm run create-claim-code
```

This command loads root `.env` just like `pnpm dev`, then prints the workspace path it wrote to. The printed `Workspace:` path must match the workspace path in the backend startup logs.

Open `http://localhost:3000`. If the workspace is unclaimed, the app redirects to `/claim`. Enter the generated code and set the owner password.

If the workspace is already claimed, the same command generates a `RECLAIM` code instead of a first-time `CLAIM` code. Reclaim is for local operator recovery and rotates the owner password while revoking existing sessions.

Running the command again rotates the existing claim/reclaim code. Any previous code stops working, so use the newest printed code.
If an active code already exists, the command asks for confirmation before rotating it. For non-interactive local automation, pass `--yes` after pnpm's argument separator:

```bash
pnpm run create-claim-code -- --yes
```

## Testing From A Fresh Local Claim

For local development only, stop the app and remove the owner auth file:

```bash
rm -f .cc/workspace/auth/owner-access.json
```

Then start the app again, generate a new code, and claim the workspace from `/claim`.

If you use a custom workspace directory, remove that workspace's auth file instead:

```bash
rm -f "$CC_WORKSPACE_DIR/auth/owner-access.json"
```

Do not use this as a production recovery workflow. Removing `owner-access.json` clears owner password/session state for that workspace.

## Local Password Change Testing

After claiming and signing in:

1. Open `Profile`.
2. Use `Owner password` to enter current password, new password, and confirmation.
3. Submit `Change password`.
4. Confirm the success message says other browser sessions were signed out.
5. Log out and verify the old password no longer works and the new password does.

To test session invalidation, sign in from two browsers or one normal window plus one private window. Change the password in one session, then refresh the other session. The other session should be treated as unauthenticated.

## Production Claiming

Production runs usually use `ccenter` and an env file. Keep `CC_WORKSPACE_DIR` stable, because the workspace directory is the source of truth for auth, database, specialists, settings, and history.

`ccenter start` and `ccenter serve` create the env file on first run when it is missing. `ccenter claim` and `ccenter claim-code` require an existing env file; they do not create one.

Example production env file:

```bash
CC_WORKSPACE_DIR=/var/lib/commandscenter/workspace
CC_SECRET_KEY=<generate-a-long-random-secret>
CC_PUBLIC_ORIGIN=https://commands.example.com
CC_HOST=0.0.0.0
CC_PORT=3000
NODE_ENV=production
```

Start production:

```bash
ccenter start --cc-env-file /etc/commandscenter.env
```

On first start for an unclaimed workspace, startup logs print a one-time claim code and the `/claim` URL. After the workspace is claimed, startup logs do not print old claim codes.

Generate the initial claim or later reclaim code on the production host using the same env file and workspace path:

```bash
ccenter claim --cc-env-file /etc/commandscenter.env
```

`ccenter claim-code` is an alias for the same command.

For automation, use machine-readable output:

```bash
ccenter claim --cc-env-file /etc/commandscenter.env --format json --yes
```

If an active claim/reclaim code already exists, `ccenter claim` asks for confirmation before generating a new one. Confirming removes the old code and prints a new code; only the newest code works. For non-interactive automation, use `--yes`:

```bash
ccenter claim --cc-env-file /etc/commandscenter.env --yes
```

Then open the production URL. If unclaimed, use `/claim`; if already claimed and you generated a reclaim code, use the reclaim flow when available or keep the code for local operator recovery.

Production notes:

- Set `CC_PUBLIC_ORIGIN` to the exact external origin users open in the browser.
- Add `CC_ALLOWED_ORIGINS` only for additional trusted proxy aliases.
- Run `ccenter claim` on the host that has access to the same `CC_WORKSPACE_DIR` as the running server. If the service sets `CC_WORKSPACE_DIR` outside the env file, pass that variable to the claim command too.
- Run `ccenter claim` as the same OS user as the service, or from inside the same container, so the `0600` auth file remains readable and writable by the runtime.
- Treat claim/reclaim codes like temporary root credentials.
- Prefer password change from `Profile` for normal credential rotation.
- Use reclaim only when the owner password is lost.

## Docker Claiming

Docker claim codes work only when the claim command sees the same mounted workspace as the running container. The default image uses:

```bash
CC_WORKSPACE_DIR=/workspace/.cc/workspace
```

With the README Compose example, generate the code inside the running service container:

```bash
docker compose exec commandscenter ccenter claim --cc-env-file /workspace/.cc/.env
```

On first container start for an unclaimed mounted workspace, Docker logs also include claim instructions and a runtime-generated one-time claim code. The code is based on the mounted workspace state and is not baked into the image.

For non-interactive rotation, add `--yes`:

```bash
docker compose exec commandscenter ccenter claim --cc-env-file /workspace/.cc/.env --yes
```

You can also run a one-off container against the same volume:

```bash
docker run --rm -it \
  -v "$PWD/workspace:/workspace" \
  commandscenter:local \
  ccenter claim --cc-env-file /workspace/.cc/.env
```

Do not generate the claim code on the host unless the host command uses the exact same mounted workspace path and compatible file ownership. Otherwise the code is written to a different `auth/owner-access.json` and will not work in the container.

## Service Claiming

The service installer starts the service, generates the first owner claim code using the same env file and runtime user, and prints the code in the install summary. Keep that code and enter it on the claim screen to unlock the instance.

On Linux, the installer writes the systemd service with `User=` and `Group=` set to the installing user by default. Override with `CCENTER_SERVICE_USER` and `CCENTER_SERVICE_GROUP` only when you intentionally run under another account; the installer will run the claim command as that service user and pass the same `CC_WORKSPACE_DIR` used by the service. On macOS, launchd runs under the current user and `CCENTER_SERVICE_USER` is not used.

## Public Domain Claiming

When exposing CommandsCenter through HTTPS, set the exact browser origin:

```bash
CC_PUBLIC_ORIGIN=https://commands.example.com
```

Recommended sequence:

1. Start CommandsCenter privately or behind the reverse proxy.
2. Read the startup claim code from logs, or run `ccenter claim --cc-env-file <path>` in the same workspace context.
3. Open `https://commands.example.com/claim`.
4. Claim the workspace, then use normal login afterward.

The reverse proxy must forward `Host`, `X-Forwarded-Proto`, and WebSocket upgrade headers. CommandsCenter still enforces owner sessions, CSRF, and origin checks even if the proxy also has access control. Use `CC_ALLOWED_ORIGINS` only for additional trusted public aliases.

## Production Reset Warning

Do not delete `auth/owner-access.json` in production unless you intentionally want to remove owner password and session state for that workspace. If you need a full factory reset, back up the entire workspace first:

```bash
tar -czf commandscenter-workspace-backup.tgz -C /var/lib/commandscenter workspace
```

Then stop the server and remove only the auth state if that is the intended recovery action:

```bash
rm -f /var/lib/commandscenter/workspace/auth/owner-access.json
```

Restart the server, run `ccenter claim --cc-env-file /etc/commandscenter.env`, and claim the workspace again.
