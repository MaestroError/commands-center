import { useMemo } from "react";
import { File as FileIcon, X } from "lucide-react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { EditorTab, EditorTabKey } from "@/hooks/use-editor-tabs";

type Props = {
  tabs: EditorTab[];
  activeKey?: EditorTabKey;
  onActivate: (key: EditorTabKey) => void;
  onClose: (key: EditorTabKey) => void;
  onMove: (from: number, to: number) => void;
};

export function EditorTabBar(props: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => props.tabs.map((tab) => tab.key), [props.tabs]);

  if (props.tabs.length === 0) {
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id as EditorTabKey);
    const to = ids.indexOf(over.id as EditorTabKey);
    if (from === -1 || to === -1) return;
    const reordered = arrayMove(ids, from, to);
    void reordered;
    props.onMove(from, to);
  }

  return (
    <div
      aria-label="Open files"
      className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-border bg-background"
      role="tablist"
    >
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          {props.tabs.map((tab) => (
            <SortableEditorTab
              key={tab.key}
              active={tab.key === props.activeKey}
              onActivate={props.onActivate}
              onClose={props.onClose}
              tab={tab}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableEditorTab(props: {
  tab: EditorTab;
  active: boolean;
  onActivate: (key: EditorTabKey) => void;
  onClose: (key: EditorTabKey) => void;
}) {
  const { tab, active } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.key,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div
      aria-controls="editor-surface-panel"
      aria-selected={active}
      className={`group relative flex h-full max-w-[16rem] shrink-0 cursor-pointer items-center gap-2 border-r border-border px-3 text-sm transition-colors ${
        active
          ? "bg-surface font-medium text-text-primary"
          : "bg-background text-text-secondary hover:bg-surface/60"
      }`}
      data-testid={`editor-tab-${tab.key}`}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          props.onClose(tab.key);
        }
      }}
      onClick={() => props.onActivate(tab.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onActivate(tab.key);
        }
      }}
      ref={setNodeRef}
      style={style}
      title={`${tab.root}:${tab.path}`}
      {...attributes}
      {...listeners}
      role="tab"
      tabIndex={0}
    >
      <FileIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">{tab.name}</span>
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent"
        />
      ) : null}
      {tab.dirty ? (
        <span
          aria-label="Unsaved changes"
          className="inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
          data-testid={`editor-tab-dirty-${tab.key}`}
        />
      ) : null}
      <button
        aria-label={`Close ${tab.name}`}
        className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary opacity-60 hover:bg-border hover:opacity-100"
        data-testid={`editor-tab-close-${tab.key}`}
        onClick={(event) => {
          event.stopPropagation();
          props.onClose(tab.key);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        type="button"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
