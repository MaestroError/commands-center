import { PageHeader } from "@/components/common/PageHeader";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";

type GenericPlaceholderPageProps = {
  title: string;
  description: string;
  withBottomPane?: boolean;
};

export function GenericPlaceholderPage(props: GenericPlaceholderPageProps) {
  return (
    <div className="grid gap-4">
      <PageHeader description={props.description} eyebrow={props.title} title={props.title} />
      <WorkspaceLayout
        bottomPane={
          props.withBottomPane
            ? {
                title: "Bottom pane",
                tabs: [
                  {
                    id: "terminal",
                    label: "Terminal",
                    content: (
                      <PlaceholderText text="Bottom-docked work surfaces are available for terminals and other horizontal tools." />
                    ),
                  },
                ],
              }
            : undefined
        }
        primary={<PlaceholderText text={props.description} />}
      />
    </div>
  );
}

function PlaceholderText(props: { text: string }) {
  return (
    <div className="flex h-full min-h-[28rem] items-center justify-center p-8 text-center text-sm leading-6 text-text-secondary">
      {props.text}
    </div>
  );
}
