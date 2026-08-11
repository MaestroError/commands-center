// Shared shell for the Integrations sections that list connections to one
// provider (Composio accounts, other CC instances). Both render the same panel,
// card, and activation affordances; only their copy and extra actions differ.

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { McpServer } from "@cc/shared/schemas";

import {
  friendlyStatus,
  statusBadgeVariant,
  usePersistentBooleanState,
} from "./integration-helpers";
import { OpenInNewIcon } from "./integration-icons";
import { SecretKeyPill, SectionToggleButton } from "./integration-parts";

export function ConnectionsSection(props: {
  title: string;
  description: ReactNode;
  storageKey: string;
  addLabel: string;
  addDisabled?: boolean;
  onAdd: () => void;
  isEmpty: boolean;
  emptyState: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = usePersistentBooleanState(props.storageKey, true);

  return (
    <section className="cc-panel p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-text-primary">{props.title}</h2>
            <SectionToggleButton
              expanded={expanded}
              label={props.title}
              onClick={() => setExpanded((current) => !current)}
            />
          </div>
          <div className="mt-1 text-sm text-text-secondary">{props.description}</div>
        </div>
        <Button
          aria-label={props.addLabel}
          disabled={props.addDisabled}
          onClick={props.onAdd}
          type="button"
        >
          Add
        </Button>
      </div>

      {expanded ? (
        <div className="mt-5">
          {props.isEmpty ? (
            props.emptyState
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{props.children}</div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function ConnectionCard(props: {
  server: McpServer;
  busy: boolean;
  restartHint: string;
  activationError?: string;
  details?: ReactNode;
  extraActions?: ReactNode;
  onActivate: () => void;
  onDisable: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const status = props.server.runtimeStatus ?? {
    status: props.server.enabled ? "disconnected" : "disabled",
  };
  const missingSecrets = props.server.missingSecrets ?? [];

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">{props.server.name}</h3>
        <Badge variant={statusBadgeVariant(status)}>{friendlyStatus(status)}</Badge>
      </div>

      {props.details ? (
        <div className="mt-4 break-all text-xs text-text-secondary">{props.details}</div>
      ) : null}

      {missingSecrets.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warning-border bg-warning-surface p-3 text-xs text-warning-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">Missing secret values</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingSecrets.map((secret) => (
                  <SecretKeyPill key={secret} secret={secret} />
                ))}
              </div>
            </div>
            <a
              aria-label="Open secrets in new tab"
              className="rounded-md p-1.5 text-warning transition hover:bg-warning/10"
              href="/settings"
              rel="noreferrer"
              target="_blank"
            >
              <OpenInNewIcon />
            </a>
          </div>
        </div>
      ) : null}

      {"error" in status ? <p className="mt-3 text-sm text-danger">{status.error}</p> : null}

      {props.server.requiresEngineRestart && !props.server.enabled ? (
        <p className="mt-3 text-sm text-warning-foreground">{props.restartHint}</p>
      ) : null}

      {props.activationError ? (
        <p className="mt-3 text-sm text-danger">{props.activationError}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {props.server.enabled ? (
          <Button
            variant="secondary"
            disabled={props.busy}
            onClick={() => void props.onDisable()}
            type="button"
          >
            {props.busy ? "Updating..." : "Disable"}
          </Button>
        ) : (
          <Button disabled={props.busy} onClick={props.onActivate} type="button">
            Activate
          </Button>
        )}
        {props.extraActions}
        <Button
          variant="danger"
          disabled={props.busy}
          onClick={() => void props.onRemove()}
          type="button"
        >
          Remove
        </Button>
      </div>
    </article>
  );
}
