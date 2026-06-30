import { lazy, Suspense } from "react";

const MilkdownDocumentEditor = lazy(async () =>
  import("./MilkdownDocumentEditor").then((module) => ({
    default: module.MilkdownDocumentEditor,
  })),
);

type LazyMilkdownEditorProps = {
  initialContent: string;
  readonly?: boolean;
  onChange?: (markdown: string) => void;
};

export function LazyMilkdownEditor(props: LazyMilkdownEditorProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[16rem] items-center justify-center text-sm text-text-secondary">
          Loading editor...
        </div>
      }
    >
      <MilkdownDocumentEditor {...props} />
    </Suspense>
  );
}
