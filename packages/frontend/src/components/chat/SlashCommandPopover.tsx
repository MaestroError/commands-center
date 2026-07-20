import { useEffect, useMemo, useRef } from "react";
import { useFilteredList } from "../../hooks/use-filtered-list";

interface SlashCommand {
  name: string;
  description: string;
  type: "builtin" | "skill";
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  { name: "new", description: "Start a fresh conversation", type: "builtin" },
  { name: "compact", description: "Summarize the session to reduce context size", type: "builtin" },
];

interface SlashCommandPopoverProps {
  query: string;
  skills?: { slug: string; description?: string }[];
  includeBuiltInCommands?: boolean;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  registerKeyHandler?: (handler: ((e: React.KeyboardEvent) => boolean) | null) => void;
  position?: { top: number; left: number };
}

export function SlashCommandPopover({
  query,
  skills,
  includeBuiltInCommands = true,
  onSelect,
  onClose,
  onKeyDown: parentOnKeyDown,
  registerKeyHandler,
  position,
}: SlashCommandPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const allCommands = useMemo(() => {
    const skillCommands: SlashCommand[] = (skills ?? []).map((s) => ({
      name: s.slug,
      description: s.description ?? `Run the ${s.slug} skill`,
      type: "skill" as const,
    }));
    return includeBuiltInCommands ? [...BUILTIN_COMMANDS, ...skillCommands] : skillCommands;
  }, [includeBuiltInCommands, skills]);

  const { filtered, activeIndex, setActiveIndex, onKeyDown, setQuery } =
    useFilteredList<SlashCommand>({
      items: allCommands,
      filterKey: "name",
      onSelect,
      onClose,
    });

  // Register key handler for parent forwarding
  useEffect(() => {
    registerKeyHandler?.(onKeyDown);
    return () => registerKeyHandler?.(null);
  }, [registerKeyHandler, onKeyDown]);

  // Sync query from parent
  useEffect(() => {
    setQuery(query);
  }, [query, setQuery]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && filtered.length > 0) {
      const activeElement = listRef.current.children[activeIndex] as HTMLElement | undefined;
      activeElement?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown(e)) {
      return;
    }
    parentOnKeyDown(e);
  };

  return (
    <div
      className="absolute z-[100] w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      style={
        position
          ? { top: position.top, left: position.left }
          : { bottom: "calc(100% + 4px)", left: 0 }
      }
      onKeyDown={handleKeyDown}
    >
      <div className="border-b border-border px-3 py-2 text-xs text-text-secondary">Commands</div>
      <div ref={listRef} className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">
            No matching commands
          </div>
        ) : (
          filtered.map((command, index) => (
            <button
              key={command.name}
              type="button"
              className={`w-full px-3 py-2 text-left ${
                index === activeIndex ? "bg-surface-elevated" : "hover:bg-surface-elevated"
              }`}
              onClick={() => onSelect(command)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-text-primary">/{command.name}</span>
                {command.type === "skill" && (
                  <span className="rounded bg-info-surface px-1.5 py-0.5 text-xs text-info-foreground">
                    skill
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-text-secondary">{command.description}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export type { SlashCommand };
