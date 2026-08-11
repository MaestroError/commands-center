import { EmptyState } from "@/components/common/PageStates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { McpServer } from "@cc/shared/schemas";

import {
  CC_INSTANCE_SECTION_STORAGE_KEY,
  friendlyStatus,
  statusBadgeVariant,
  usePersistentBooleanState,
} from "./integration-helpers";
import { OpenInNewIcon } from "./integration-icons";
import { SecretKeyPill, SectionToggleButton } from "./integration-parts";

export function CcInstancesSection(props: {
  servers: McpServer[];
  busy: boolean;
  activationError?: { serverId: string; message: string };
  onAdd: () => void;
  onActivate: (server: McpServer) => void;
  onDisable: (server: McpServer) => Promise<void>;
  onEdit: (server: McpServer) => void;
  onRemove: (server: McpServer) => Promise<void>;
}) {
  const [expanded, setExpanded] = usePersistentBooleanState(CC_INSTANCE_SECTION_STORAGE_KEY, true);

  return (
    <section className="cc-panel p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-text-primary">Connected CC instances</h2>
            <SectionToggleButton
              expanded={expanded}
              label="Connected CC instances"
              onClick={() => setExpanded((current) => !current)}
            />
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Reach another CommandsCenter instance as an MCP server, using an API token you create
            there.
          </p>
        </div>
        <Button disabled={props.busy} onClick={props.onAdd} type="button">
          Add
        </Button>
      </div>

      {expanded && props.servers.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.servers.map((server) => (
            <CcInstanceCard
              activationError={
                props.activationError?.serverId === server.id
                  ? props.activationError.message
                  : undefined
              }
              busy={props.busy}
              key={server.id}
              onActivate={() => props.onActivate(server)}
              onDisable={() => props.onDisable(server)}
              onEdit={() => props.onEdit(server)}
              onRemove={() => props.onRemove(server)}
              server={server}
            />
          ))}
        </div>
      ) : null}

      {expanded && props.servers.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            description="Add an instance to use its templates, tasks, and documents as tools here."
            title="No CC instances connected yet"
          />
        </div>
      ) : null}
    </section>
  );
}

function CcInstanceCard(props: {
  server: McpServer;
  busy: boolean;
  activationError?: string;
  onActivate: () => void;
  onDisable: () => Promise<void>;
  onEdit: () => void;
  onRemove: () => Promise<void>;
}) {
  const status = props.server.runtimeStatus ?? {
    status: props.server.enabled ? "disconnected" : "disabled",
  };
  const missingSecrets = props.server.missingSecrets ?? [];
  const endpoint = props.server.config.transport === "stdio" ? "" : props.server.config.url;

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-text-primary">{props.server.name}</h3>
        <Badge variant={statusBadgeVariant(status)}>{friendlyStatus(status)}</Badge>
      </div>

      <p className="mt-4 break-all text-xs text-text-secondary">{endpoint}</p>

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
        <p className="mt-3 text-sm text-warning-foreground">
          Activating this instance requires an AI engine restart to load the saved token.
        </p>
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
            Disable
          </Button>
        ) : (
          <Button disabled={props.busy} onClick={props.onActivate} type="button">
            Activate
          </Button>
        )}
        <Button variant="secondary" onClick={props.onEdit} type="button">
          Edit
        </Button>
        <Button variant="danger" onClick={() => void props.onRemove()} type="button">
          Remove
        </Button>
      </div>
    </article>
  );
}
