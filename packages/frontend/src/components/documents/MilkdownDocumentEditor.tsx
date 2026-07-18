import { useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { insert } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";

import { buildFileManagerHref } from "@/lib/file-manager-href";

import { buildWorkspaceInsertMarkdown, resolveDocumentAssetUrl } from "./document-asset";
import { createBase64UploadHandler } from "./image-upload";
import { WorkspaceFilePickerDialog } from "./WorkspaceFilePickerDialog";

// lucide "folder-symlink" style glyph as an SVG string (Crepe menu icons are SVG strings).
const WORKSPACE_FILE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="m9 14 2 2-2 2"/><path d="M13 18h2"/></svg>`;

type MilkdownDocumentEditorProps = {
  initialContent: string;
  readonly?: boolean;
  onChange?: (markdown: string) => void;
};

export function MilkdownDocumentEditor(props: MilkdownDocumentEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  // Bridges the Milkdown slash-menu (runs outside React) to React dialog state.
  const openPickerRef = useRef<() => void>(() => undefined);
  const [pickerOpen, setPickerOpen] = useState(false);

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
        // Embed uploaded/dropped images as base64 data URIs so documents stay
        // self-contained. Used by both inline and block image upload flows.
        // proxyDomURL resolves `workspace:` references to the asset endpoint for
        // display while keeping the reference itself in the markdown.
        [Crepe.Feature.ImageBlock]: {
          onUpload: createBase64UploadHandler(),
          proxyDomURL: resolveDocumentAssetUrl,
        },
        // Add a "/" slash-menu item to reference an existing workspace file.
        [Crepe.Feature.BlockEdit]: {
          buildMenu: (builder) => {
            const group = builder.addGroup("workspace", "Workspace");
            group.addItem("workspace-file", {
              label: "Workspace file",
              icon: WORKSPACE_FILE_ICON,
              onRun: () => {
                openPickerRef.current();
              },
            });
          },
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

    crepeRef.current = crepe;

    return () => {
      void crepe.destroy();
      crepeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the ref pointing at a setter that opens the picker.
  openPickerRef.current = () => setPickerOpen(true);

  const handleSelectFile = (path: string) => {
    const markdown = buildWorkspaceInsertMarkdown(path, buildFileManagerHref({ path }));
    crepeRef.current?.editor.action(insert(markdown));
    setPickerOpen(false);
  };

  return (
    <>
      <div ref={containerRef} className="milkdown-editor-wrapper" data-testid="milkdown-editor" />
      {pickerOpen ? (
        <WorkspaceFilePickerDialog
          onClose={() => setPickerOpen(false)}
          onSelect={handleSelectFile}
        />
      ) : null}
    </>
  );
}
