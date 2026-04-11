import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export function WorkspaceChatPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="Direct chat will become the densest workspace surface in the MVP, so this page demonstrates both side and bottom docks on top of the shared layout system."
        eyebrow="Direct Chat"
        title="Persistent agent conversation surface"
      />
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          tabs: [
            {
              id: "terminal-1",
              label: "Terminal 1",
              content: (
                <PaneText text="Multiple terminal sessions belong in tabbed bottom panes." />
              ),
            },
            {
              id: "terminal-2",
              label: "Terminal 2",
              content: (
                <PaneText text="Additional sessions can share the same dock without creating new pages." />
              ),
            },
          ],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [
            {
              id: "files",
              label: "Files",
              content: <PaneText text="Workspace files, memory, and preferences can live here." />,
            },
            {
              id: "tools",
              label: "Tools",
              content: (
                <PaneText text="Tool calls and attachments can be added as context tabs later." />
              ),
            },
          ],
        }}
        primary={
          <PaneText text="Streaming conversation and composer controls will occupy the primary pane." />
        }
      />
    </div>
  );
}

function PaneText(props: { text: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center text-center text-sm leading-6 text-text-secondary">
      {props.text}
    </div>
  );
}
