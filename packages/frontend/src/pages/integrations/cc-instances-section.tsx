import { EmptyState } from "@/components/common/PageStates";
import { Button } from "@/components/ui/button";
import type { McpServer } from "@cc/shared/schemas";

import { ConnectionCard, ConnectionsSection } from "./connections-section";
import { CC_INSTANCE_SECTION_STORAGE_KEY } from "./integration-helpers";

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
  return (
    <ConnectionsSection
      addLabel="Add CC instance"
      addDisabled={props.busy}
      description="Reach another CommandsCenter instance as an MCP server, using an API token you create there."
      emptyState={
        <EmptyState
          description="Add an instance to use its templates, tasks, and documents as tools here."
          title="No CC instances connected yet"
        />
      }
      isEmpty={props.servers.length === 0}
      onAdd={props.onAdd}
      storageKey={CC_INSTANCE_SECTION_STORAGE_KEY}
      title="Connected CC instances"
    >
      {props.servers.map((server) => (
        <ConnectionCard
          activationError={
            props.activationError?.serverId === server.id
              ? props.activationError.message
              : undefined
          }
          busy={props.busy}
          details={server.config.transport === "stdio" ? undefined : server.config.url}
          extraActions={
            <Button variant="secondary" onClick={() => props.onEdit(server)} type="button">
              Edit
            </Button>
          }
          key={server.id}
          onActivate={() => props.onActivate(server)}
          onDisable={() => props.onDisable(server)}
          onRemove={() => props.onRemove(server)}
          restartHint="Activating this instance requires an AI engine restart to load the saved token."
          server={server}
        />
      ))}
    </ConnectionsSection>
  );
}
