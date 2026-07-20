import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PasswordInput } from "@/components/common/PasswordInput";
import { useOwnerAuth } from "@/context/use-owner-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ClaimPage() {
  const auth = useOwnerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [claimCode, setClaimCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberBrowser, setRememberBrowser] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await auth.claim({ claimCode, password, confirmPassword, rememberBrowser });
      void navigate(getRedirectPath(location.state), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to claim this workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10 text-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="grid gap-2">
          <p className="cc-eyebrow">Owner access</p>
          <h1 className="text-2xl font-semibold text-text-primary">Claim this workspace</h1>
          <p className="text-sm leading-6 text-text-secondary">
            Enter the local claim code and set the owner password for this portable workspace.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Claim code
            <Input
              autoComplete="one-time-code"
              onChange={(event) => setClaimCode(event.target.value)}
              required
              type="text"
              value={claimCode}
            />
          </label>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="owner-password">
              Password
            </label>
            <PasswordInput
              aria-describedby="owner-password-requirements"
              autoComplete="new-password"
              id="owner-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              value={password}
            />
            <span id="owner-password-requirements" className="text-xs leading-5 text-text-muted">
              Use at least 10 characters, including uppercase, lowercase, a number, and a symbol.
            </span>
          </div>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Confirm password
            <PasswordInput
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              value={confirmPassword}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              checked={rememberBrowser}
              className="h-4 w-4 rounded border-border bg-surface"
              onChange={(event) => setRememberBrowser(event.target.checked)}
              type="checkbox"
            />
            Remember this browser
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button className="justify-center" disabled={submitting} type="submit">
            {submitting ? "Claiming..." : "Claim workspace"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function getRedirectPath(state: unknown): string {
  if (state && typeof state === "object" && "from" in state) {
    const from = state.from;
    if (
      from &&
      typeof from === "object" &&
      "pathname" in from &&
      typeof from.pathname === "string"
    ) {
      return from.pathname;
    }
  }

  return "/";
}
