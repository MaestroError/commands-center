import { Button } from "@/components/ui/button";
import type { McpServer } from "@cc/shared/schemas";

import { ConnectionCard, ConnectionsSection } from "./connections-section";
import { COMPOSIO_SECTION_STORAGE_KEY, COMPOSIO_SERVER_URL } from "./integration-helpers";

export function ComposioSection(props: {
  servers: McpServer[];
  busy: boolean;
  activationError?: { serverId: string; message: string };
  onAdd: () => void;
  onActivate: (server: McpServer) => void;
  onAuthenticate: (server: McpServer) => Promise<void>;
  onDisable: (server: McpServer) => Promise<void>;
  onRemoveAuth: (server: McpServer) => Promise<void>;
  onRemove: (server: McpServer) => Promise<void>;
}) {
  return (
    <ConnectionsSection
      addLabel="Add Composio connection"
      addDisabled={props.busy}
      description={
        <>
          <p>
            Connect your workspace to external apps through Composio, including GitHub, Slack,
            Notion, Linear, HubSpot, and other supported services. Add one connection per Composio
            account.
          </p>
          <p className="mt-2 flex flex-wrap gap-2">
            <a
              className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent"
              href="https://composio.dev/for-you"
              rel="noreferrer"
              target="_blank"
            >
              Learn More
            </a>
            <a
              className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent"
              href="https://dashboard.composio.dev/"
              rel="noreferrer"
              target="_blank"
            >
              Open Dashboard
            </a>
          </p>
        </>
      }
      emptyState={
        <div className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-text-secondary">
          <p className="text-text-primary">
            Connect to unlock actions across apps like GitHub, Slack, Notion, Linear, HubSpot, and
            more.
          </p>
          <p className="mt-2 text-xs">Composio has a generous free plan for getting started.</p>
          <p className="mt-2 text-xs">
            <a
              className="font-mono hover:text-text-primary"
              href={COMPOSIO_SERVER_URL}
              rel="noreferrer"
              target="_blank"
            >
              {COMPOSIO_SERVER_URL}
            </a>{" "}
            is preconfigured by CC.
          </p>
        </div>
      }
      isEmpty={props.servers.length === 0}
      onAdd={props.onAdd}
      storageKey={COMPOSIO_SECTION_STORAGE_KEY}
      title="Composio"
    >
      {props.servers.map((server) => {
        const status = server.runtimeStatus ?? {
          status: server.enabled ? "disconnected" : "disabled",
        };
        const oauth = server.config.transport !== "stdio" && server.config.authMethod === "oauth";

        return (
          <ConnectionCard
            activationError={
              props.activationError?.serverId === server.id
                ? props.activationError.message
                : undefined
            }
            busy={props.busy}
            details={COMPOSIO_SERVER_URL}
            extraActions={
              oauth ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={props.busy}
                    onClick={() => void props.onAuthenticate(server)}
                    type="button"
                  >
                    {status.status === "connected" ? "Re-authenticate" : "Authenticate"}
                  </Button>
                  {status.status === "connected" ? (
                    <Button
                      variant="secondary"
                      disabled={props.busy}
                      onClick={() => void props.onRemoveAuth(server)}
                      type="button"
                    >
                      Remove auth
                    </Button>
                  ) : null}
                </>
              ) : null
            }
            key={server.id}
            onActivate={() => props.onActivate(server)}
            onDisable={() => props.onDisable(server)}
            onRemove={() => props.onRemove(server)}
            restartHint="Activating this connection requires an AI engine restart to load the saved API key."
            server={server}
          />
        );
      })}
    </ConnectionsSection>
  );
}
