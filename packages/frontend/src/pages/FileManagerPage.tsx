import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

export function FileManagerPage() {
  return (
    <div className="grid gap-4">
      <PageHeader
        description="The page-level workspace layout already supports the file manager's main browser, preview sidebar, and bottom utility surfaces."
        eyebrow="File Manager"
        title="Browse and edit workspace files"
      />
      <WorkspaceLayout
        bottomPane={{
          title: "Bottom pane",
          tabs: [
            {
              id: "terminal",
              label: "Terminal",
              content: (
                <PaneText text="Terminals and file activity panels can share this bottom dock." />
              ),
            },
          ],
        }}
        contextPane={{
          title: "Context pane",
          tabs: [
            {
              id: "preview",
              label: "Preview",
              content: (
                <PaneText text="File previews and metadata will live in the context pane." />
              ),
            },
            {
              id: "actions",
              label: "Actions",
              content: (
                <PaneText text="Contextual file actions can be injected here without changing the shell." />
              ),
            },
          ],
        }}
        primary={
          <PaneText text="The primary pane is reserved for the main file browser and editor workflow." />
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
