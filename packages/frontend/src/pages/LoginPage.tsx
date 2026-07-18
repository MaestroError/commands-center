import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PasswordInput } from "@/components/common/PasswordInput";
import { useOwnerAuth } from "@/context/use-owner-auth";

export function LoginPage() {
  const auth = useOwnerAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [rememberBrowser, setRememberBrowser] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await auth.login({ password, rememberBrowser });
      void navigate(getRedirectPath(location.state), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10 text-text-primary">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
        <div className="grid gap-2">
          <p className="cc-eyebrow">Owner access</p>
          <h1 className="text-2xl font-semibold text-text-primary">Sign in to CommandsCenter</h1>
          <p className="text-sm leading-6 text-text-secondary">
            Use the owner password for this workspace to continue.
          </p>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={(event) => void onSubmit(event)}>
          <label className="grid gap-2 text-sm font-medium text-text-primary">
            Password
            <PasswordInput
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              required
              value={password}
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
          <button className="cc-button justify-center" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
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
