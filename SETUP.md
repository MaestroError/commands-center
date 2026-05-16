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

Production runs usually use `ccenter` and an env file. Keep `CC_WORKSPACE_DIR` stable, because the workspace directory is the source of truth for auth, database, agents, settings, and history.

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

Generate the initial claim or later reclaim code on the production host using the same env file and workspace path:

```bash
ccenter claim --cc-env-file /etc/commandscenter.env
```

If an active claim/reclaim code already exists, `ccenter claim` asks for confirmation before generating a new one. Confirming removes the old code and prints a new code; only the newest code works. For non-interactive automation, use `--yes`:

```bash
ccenter claim --cc-env-file /etc/commandscenter.env --yes
```

Then open the production URL. If unclaimed, use `/claim`; if already claimed and you generated a reclaim code, use the reclaim flow when available or keep the code for local operator recovery.

Production notes:

- Set `CC_PUBLIC_ORIGIN` to the exact external origin users open in the browser.
- Add `CC_ALLOWED_ORIGINS` only for additional trusted proxy aliases.
- Run `ccenter claim` on the host that has access to the same `CC_WORKSPACE_DIR` as the running server.
- Treat claim/reclaim codes like temporary root credentials.
- Prefer password change from `Profile` for normal credential rotation.
- Use reclaim only when the owner password is lost.

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
