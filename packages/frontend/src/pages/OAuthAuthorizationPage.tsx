import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import type { OAuthInteractionDetail } from "@cc/shared/schemas";

import { PasswordInput } from "@/components/common/PasswordInput";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { decideOAuthInteraction, getOAuthInteraction } from "@/lib/api/oauth";

type OAuthAuthorizationPageProps = {
  redirect?: (url: string) => void;
};

export function OAuthAuthorizationPage(props: OAuthAuthorizationPageProps) {
  const { uid } = useParams();
  const [interaction, setInteraction] = useState<OAuthInteractionDetail | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);
  const redirect = props.redirect ?? ((url: string) => window.location.assign(url));

  useEffect(() => {
    let cancelled = false;

    async function loadInteraction(): Promise<void> {
      if (!uid) {
        setError("OAuth interaction is invalid or expired.");
        setLoading(false);
        return;
      }

      try {
        const detail = await getOAuthInteraction(uid);
        if (!cancelled) {
          setInteraction(detail);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(readError(loadError, "Unable to load this authorization request."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInteraction();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function approve(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!interaction) {
      return;
    }

    setError(null);
    setSubmitting("approve");

    try {
      const result = await decideOAuthInteraction(interaction.uid, {
        decision: "approve",
        apiToken,
      });
      setApiToken("");
      redirect(result.redirectTo);
    } catch (submitError) {
      setApiToken("");
      setError(readError(submitError, "Unable to authorize this connection."));
      setSubmitting(null);
    }
  }

  async function deny(): Promise<void> {
    if (!interaction) {
      return;
    }

    setError(null);
    setSubmitting("deny");

    try {
      const result = await decideOAuthInteraction(interaction.uid, { decision: "deny" });
      setApiToken("");
      redirect(result.redirectTo);
    } catch (submitError) {
      setApiToken("");
      setError(readError(submitError, "Unable to cancel this authorization request."));
      setSubmitting(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10 text-text-primary">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl sm:p-8">
        {loading ? (
          <div aria-live="polite" className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              MCP authorization
            </p>
            <h1 className="text-2xl font-semibold text-text-primary">
              Loading authorization request
            </h1>
            <p className="text-sm leading-6 text-text-secondary">
              Checking the connection details...
            </p>
          </div>
        ) : interaction ? (
          <>
            <header className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                MCP authorization
              </p>
              <h1 className="text-2xl font-semibold text-text-primary">
                Connect {interaction.client.name}
              </h1>
              <p className="text-sm leading-6 text-text-secondary">
                Enter a CommandsCenter API token to give this client access to the MCP tools allowed
                by that token.
              </p>
            </header>

            <div className="mt-5 rounded-xl border border-info-border bg-info-surface p-4 text-sm text-info-foreground">
              After authorization, you will return to{" "}
              {readRedirectDestination(interaction.redirectUri)}. Only continue if you recognize
              this client and destination.
            </div>

            <form className="mt-6 grid gap-4" onSubmit={(event) => void approve(event)}>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-text-primary" htmlFor="oauth-api-token">
                  API token
                </label>
                <PasswordInput
                  aria-describedby="oauth-api-token-description"
                  autoComplete="off"
                  autoFocus
                  disabled={submitting !== null}
                  id="oauth-api-token"
                  onChange={(event) => setApiToken(event.target.value)}
                  required
                  spellCheck={false}
                  value={apiToken}
                />
                <p className="text-xs leading-5 text-text-muted" id="oauth-api-token-description">
                  The token is used for this authorization only and is not stored in the browser.
                </p>
              </div>

              {error ? <Alert role="alert">{error}</Alert> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  className="justify-center sm:order-2"
                  disabled={submitting !== null}
                  type="submit"
                >
                  {submitting === "approve" ? "Authorizing..." : "Authorize"}
                </Button>
                <Button
                  className="justify-center sm:order-1"
                  disabled={submitting !== null}
                  onClick={() => void deny()}
                  variant="secondary"
                >
                  {submitting === "deny" ? "Cancelling..." : "Cancel"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
                MCP authorization
              </p>
              <h1 className="text-2xl font-semibold text-text-primary">
                Authorization unavailable
              </h1>
              <p className="text-sm leading-6 text-text-secondary">
                Return to your MCP client and start the connection again.
              </p>
            </div>
            {error ? <Alert role="alert">{error}</Alert> : null}
          </div>
        )}
      </section>
    </main>
  );
}

function readRedirectDestination(redirectUri: string): string {
  try {
    const origin = new URL(redirectUri).origin;
    return origin === "null" ? "the requesting client" : origin;
  } catch {
    return "the requesting client";
  }
}

function readError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
