import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame-dark.css";

type MilkdownDocumentEditorProps = {
  initialContent: string;
  readonly?: boolean;
  onChange?: (markdown: string) => void;
};

export function MilkdownDocumentEditor(props: MilkdownDocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const crepe = new Crepe({
      root: container,
      defaultValue: props.initialContent,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Start writing...",
          mode: "block",
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
        onChangeRef.current?.(markdown);
      });
    });

    void crepe.create().then(() => {
      if (props.readonly) {
        crepe.setReadonly(true);
      }
    });

    return () => {
      void crepe.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="milkdown-editor-wrapper" data-testid="milkdown-editor" />
  );
}
