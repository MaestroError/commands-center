import { useCallback, useEffect, useRef, useState } from "react";

import { FileMentionPopover } from "@/components/chat/FileMentionPopover";
import { isMentionableWorkspacePath } from "@/components/chat/file-mention";
import { SlashCommandPopover, type SlashCommand } from "@/components/chat/SlashCommandPopover";
import type { TaskPromptValue } from "@/components/tasks/task-prompt";

type TaskPromptComposerProps = {
  value: TaskPromptValue;
  onChange: (value: TaskPromptValue) => void;
  agentId?: string;
  skills?: { slug: string; description?: string }[];
  disabled?: boolean;
};

export function TaskPromptComposer(props: TaskPromptComposerProps) {
  const { agentId, disabled, onChange, skills, value } = props;
  const [activePopover, setActivePopover] = useState<"file" | "slash" | null>(null);
  const [popoverQuery, setPopoverQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverKeyHandlerRef = useRef<((event: React.KeyboardEvent) => boolean) | null>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const cursorPosition = textareaRef.current?.selectionStart ?? value.text.length;
    const beforeCursor = value.text.substring(0, cursorPosition);
    const hashMatch = beforeCursor.match(/#(\S*)$/);

    if (hashMatch && agentId) {
      setActivePopover("file");
      setPopoverQuery(hashMatch[1] ?? "");
      return;
    }

    const slashMatch = beforeCursor.match(/(?:^|\s)\/(\S*)$/);

    if (slashMatch) {
      setActivePopover("slash");
      setPopoverQuery(slashMatch[1] ?? "");
      return;
    }

    setActivePopover(null);
  }, [agentId, value.text]);

  const updateValue = useCallback(
    (patch: Partial<TaskPromptValue>) => onChange({ ...valueRef.current, ...patch }),
    [onChange],
  );

  const getCursorPosition = useCallback(() => textareaRef.current?.selectionStart ?? 0, []);

  const setCursorPosition = useCallback((position: number) => {
    const textarea = textareaRef.current;
    textarea?.setSelectionRange(position, position);
  }, []);

  const addMentionedFile = useCallback(
    (path: string) => {
      if (!isMentionableWorkspacePath(path)) {
        return;
      }

      const currentValue = valueRef.current;
      const isFolder = path.endsWith("/");
      const filename = isFolder ? path : (path.split("/").pop() ?? path);

      if (currentValue.mentionedFiles.some((file) => file.path === path)) {
        return;
      }

      updateValue({ mentionedFiles: [...currentValue.mentionedFiles, { path, filename }] });
    },
    [updateValue],
  );

  const handleFileMentionSelect = useCallback(
    (path: string) => {
      if (!isMentionableWorkspacePath(path)) {
        setActivePopover(null);
        return;
      }

      const currentValue = valueRef.current;
      const isFolder = path.endsWith("/");
      const filename = isFolder ? path : (path.split("/").pop() ?? path);
      const mentionedFiles = currentValue.mentionedFiles.some((file) => file.path === path)
        ? currentValue.mentionedFiles
        : [...currentValue.mentionedFiles, { path, filename }];

      const cursorPosition = getCursorPosition();
      const beforeCursor = currentValue.text.substring(0, cursorPosition);
      const afterCursor = currentValue.text.substring(cursorPosition);
      const hashIndex = beforeCursor.lastIndexOf("#");

      if (hashIndex !== -1) {
        updateValue({
          mentionedFiles,
          text: beforeCursor.substring(0, hashIndex) + afterCursor,
        });
        setTimeout(() => {
          setCursorPosition(hashIndex);
          textareaRef.current?.focus();
        }, 0);
      } else {
        updateValue({ mentionedFiles });
      }

      setActivePopover(null);
    },
    [getCursorPosition, setCursorPosition, updateValue],
  );

  const handleSlashCommandSelect = useCallback(
    (command: SlashCommand) => {
      setActivePopover(null);

      if (command.type !== "skill") {
        return;
      }

      const currentText = valueRef.current.text;
      const cursorPosition = getCursorPosition();
      const beforeCursor = currentText.substring(0, cursorPosition);
      const afterCursor = currentText.substring(cursorPosition);
      const slashMatch = beforeCursor.match(/\/(\S*)$/);
      const slashTokenLength = slashMatch?.[0].length ?? 0;
      const nextCursorPosition = cursorPosition - slashTokenLength;
      const nextText = slashMatch
        ? `${beforeCursor.slice(0, nextCursorPosition)}${afterCursor}`
        : currentText;

      updateValue({
        selectedSkill: { slug: command.name, description: command.description },
        text: nextText,
      });
      setTimeout(() => {
        textareaRef.current?.focus();
        setCursorPosition(nextCursorPosition);
      }, 0);
    },
    [getCursorPosition, setCursorPosition, updateValue],
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => updateValue({ text: event.target.value }),
    [updateValue],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (activePopover && popoverKeyHandlerRef.current) {
        if (["ArrowUp", "ArrowDown", "Enter", "Tab"].includes(event.key)) {
          const handled = popoverKeyHandlerRef.current(event);

          if (handled) {
            return;
          }
        }
      }

      if (event.key === "Escape" && activePopover) {
        event.preventDefault();
        setActivePopover(null);
      }
    },
    [activePopover],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (disabled) {
        return;
      }

      const fileMentionPath = event.dataTransfer.getData("application/x-cc-file-mention");

      if (fileMentionPath.length > 0) {
        addMentionedFile(fileMentionPath);
        textareaRef.current?.focus();
      }
    },
    [addMentionedFile, disabled],
  );

  const handleRemoveMention = useCallback(
    (path: string) => {
      updateValue({
        mentionedFiles: value.mentionedFiles.filter((file) => file.path !== path),
      });
    },
    [updateValue, value.mentionedFiles],
  );

  const activateShortcut = useCallback(
    (shortcut: "#" | "/") => {
      if (disabled) {
        return;
      }

      updateValue({ text: shortcut });
      setActivePopover(shortcut === "#" ? "file" : "slash");
      setPopoverQuery("");

      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(1, 1);
      }, 0);
    },
    [disabled, updateValue],
  );

  const placeholder = value.selectedSkill
    ? `Prompt for /${value.selectedSkill.slug}...`
    : 'Describe the task prompt... Use "#" for files and "/" for skills';

  return (
    <div
      className={`relative rounded-md border border-border transition ${
        disabled
          ? "cursor-not-allowed bg-surface-elevated opacity-75 ring-1 ring-inset ring-border"
          : "bg-surface"
      }`}
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {value.selectedSkill ? (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-1 text-xs font-medium text-purple-400"
              title={value.selectedSkill.description}
            >
              /{value.selectedSkill.slug}
              <button
                className="ml-0.5 rounded-full p-0.5 hover:bg-purple-500/20"
                onClick={() => updateValue({ selectedSkill: null })}
                type="button"
              >
                x
              </button>
            </span>
          ) : null}
          {value.mentionedFiles.map((file) => (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent"
              key={file.path}
              title={file.path}
            >
              {file.filename}
              <button
                className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20"
                onClick={() => handleRemoveMention(file.path)}
                type="button"
              >
                x
              </button>
            </span>
          ))}
        </div>
        {value.text.length === 0 && !value.selectedSkill && value.mentionedFiles.length === 0 ? (
          <div className="hidden items-center gap-2 text-[11px] text-text-secondary lg:flex">
            <button
              className="rounded-full border border-border px-2 py-0.5 font-mono transition hover:border-accent hover:text-text-primary"
              disabled={disabled || !agentId}
              onClick={() => activateShortcut("#")}
              type="button"
            >
              # files
            </button>
            <button
              className="rounded-full border border-border px-2 py-0.5 font-mono transition hover:border-accent hover:text-text-primary"
              disabled={disabled}
              onClick={() => activateShortcut("/")}
              type="button"
            >
              / skills
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative p-3">
        <textarea
          aria-label="Task prompt"
          className="max-h-52 min-h-32 w-full resize-y bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary disabled:cursor-not-allowed disabled:text-text-secondary disabled:placeholder:text-text-secondary/70"
          disabled={disabled}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          value={value.text}
        />
        {activePopover === "file" && agentId ? (
          <FileMentionPopover
            agentId={agentId}
            onClose={() => setActivePopover(null)}
            onKeyDown={() => undefined}
            onSelect={handleFileMentionSelect}
            query={popoverQuery}
            registerKeyHandler={(handler) => {
              popoverKeyHandlerRef.current = handler;
            }}
          />
        ) : null}
        {activePopover === "slash" ? (
          <SlashCommandPopover
            includeBuiltInCommands={false}
            onClose={() => setActivePopover(null)}
            onKeyDown={() => undefined}
            onSelect={handleSlashCommandSelect}
            query={popoverQuery}
            registerKeyHandler={(handler) => {
              popoverKeyHandlerRef.current = handler;
            }}
            skills={skills}
          />
        ) : null}
      </div>
    </div>
  );
}
