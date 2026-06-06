import { useCallback, useEffect, useRef, useState } from "react";

import { FileMentionPopover } from "@/components/chat/FileMentionPopover";
import { isMentionableWorkspacePath } from "@/components/chat/file-mention";
import { SlashCommandPopover, type SlashCommand } from "@/components/chat/SlashCommandPopover";
import type { TaskPromptValue } from "@/components/tasks/task-prompt";

type TaskPromptComposerProps = {
  value: TaskPromptValue;
  onChange: (value: TaskPromptValue) => void;
  agentId?: string;
  fileSearchAgentId?: string | null;
  agents?: { id: string; name: string }[];
  skills?: { slug: string; description?: string }[];
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  /** Applied to the underlying textarea for e2e selection. */
  testId?: string;
};

export function TaskPromptComposer(props: TaskPromptComposerProps) {
  const { agentId, agents = [], disabled, fileSearchAgentId, onChange, skills, value } = props;
  const effectiveFileSearchAgentId = fileSearchAgentId === undefined ? agentId : fileSearchAgentId;
  const [activePopover, setActivePopover] = useState<"agent" | "file" | "slash" | null>(null);
  const [popoverQuery, setPopoverQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverKeyHandlerRef = useRef<((event: React.KeyboardEvent) => boolean) | null>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!props.autoFocus || disabled) {
      return;
    }

    textareaRef.current?.focus();
  }, [disabled, props.autoFocus]);

  useEffect(() => {
    const cursorPosition = textareaRef.current?.selectionStart ?? value.text.length;
    const beforeCursor = value.text.substring(0, cursorPosition);
    const hashMatch = beforeCursor.match(/#(\S*)$/);

    if (hashMatch) {
      setActivePopover("file");
      setPopoverQuery(hashMatch[1] ?? "");
      return;
    }

    const agentMatch = beforeCursor.match(/@(\S*)$/);

    if (agentMatch && agents.length > 0) {
      setActivePopover("agent");
      setPopoverQuery(agentMatch[1] ?? "");
      return;
    }

    const slashMatch = beforeCursor.match(/(?:^|\s)\/(\S*)$/);

    if (slashMatch) {
      setActivePopover("slash");
      setPopoverQuery(slashMatch[1] ?? "");
      return;
    }

    setActivePopover(null);
  }, [agents.length, value.text]);

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

  const handleAgentMentionSelect = useCallback(
    (agent: { id: string; name: string }) => {
      const currentValue = valueRef.current;
      const mentionedAgents = [agent];
      const cursorPosition = getCursorPosition();
      const beforeCursor = currentValue.text.substring(0, cursorPosition);
      const afterCursor = currentValue.text.substring(cursorPosition);
      const atIndex = beforeCursor.lastIndexOf("@");

      if (atIndex !== -1) {
        updateValue({
          mentionedAgents,
          text: beforeCursor.substring(0, atIndex) + afterCursor,
        });
        setTimeout(() => {
          setCursorPosition(atIndex);
          textareaRef.current?.focus();
        }, 0);
      } else {
        updateValue({ mentionedAgents });
      }

      setActivePopover(null);
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

  const handleRemoveAgentMention = useCallback(
    (id: string) => {
      updateValue({
        mentionedAgents: (value.mentionedAgents ?? []).filter((agent) => agent.id !== id),
      });
    },
    [updateValue, value.mentionedAgents],
  );

  const activateShortcut = useCallback(
    (shortcut: "#" | "/" | "@") => {
      if (disabled) {
        return;
      }

      updateValue({ text: shortcut });
      setActivePopover(shortcut === "#" ? "file" : shortcut === "@" ? "agent" : "slash");
      setPopoverQuery("");

      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(1, 1);
      }, 0);
    },
    [disabled, updateValue],
  );

  const placeholder =
    props.placeholder ??
    (value.selectedSkill
      ? `Prompt for /${value.selectedSkill.slug}...`
      : 'Describe the task prompt... Use "#" for files, "/" for skills, and "@" for agents');
  const mentionedAgents = value.mentionedAgents ?? [];
  const agentOptions = agents.filter((agent) =>
    agent.name.toLowerCase().includes(popoverQuery.toLowerCase()),
  );

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
          {mentionedAgents.map((agent) => (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-400"
              data-testid={`task-agent-mention-chip-${agent.id}`}
              key={agent.id}
              title={agent.name}
            >
              @{agent.name}
              <button
                className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-500/20"
                onClick={() => handleRemoveAgentMention(agent.id)}
                type="button"
              >
                x
              </button>
            </span>
          ))}
        </div>
        {value.text.length === 0 &&
        !value.selectedSkill &&
        value.mentionedFiles.length === 0 &&
        mentionedAgents.length === 0 ? (
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
            <button
              className="rounded-full border border-border px-2 py-0.5 font-mono transition hover:border-accent hover:text-text-primary"
              disabled={disabled || agents.length === 0}
              onClick={() => activateShortcut("@")}
              type="button"
            >
              @ agents
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative p-3">
        <textarea
          aria-label={props.label ?? "Task prompt"}
          className="max-h-52 min-h-32 w-full resize-y bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary disabled:cursor-not-allowed disabled:text-text-secondary disabled:placeholder:text-text-secondary/70"
          data-testid={props.testId}
          disabled={disabled}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          value={value.text}
        />
        {activePopover === "agent" ? (
          <AgentMentionPopover
            agents={agentOptions}
            onClose={() => setActivePopover(null)}
            onSelect={handleAgentMentionSelect}
            registerKeyHandler={(handler) => {
              popoverKeyHandlerRef.current = handler;
            }}
          />
        ) : null}
        {activePopover === "file" ? (
          <FileMentionPopover
            agentId={effectiveFileSearchAgentId ?? undefined}
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

function AgentMentionPopover(props: {
  agents: { id: string; name: string }[];
  onClose: () => void;
  onSelect: (agent: { id: string; name: string }) => void;
  registerKeyHandler: (handler: (event: React.KeyboardEvent) => boolean) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeOption = props.agents[activeIndex];

  useEffect(() => {
    setActiveIndex(0);
  }, [props.agents]);

  useEffect(() => {
    props.registerKeyHandler((event) => {
      if (props.agents.length === 0) return false;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % props.agents.length);
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + props.agents.length) % props.agents.length);
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (activeOption) props.onSelect(activeOption);
        return true;
      }

      return false;
    });
  }, [activeOption, props]);

  return (
    <div className="absolute left-3 right-3 top-3 z-20 max-h-56 overflow-auto rounded-xl border border-border bg-surface-elevated p-2 shadow-xl">
      {props.agents.length === 0 ? (
        <p className="px-3 py-2 text-sm text-text-secondary">No agents match.</p>
      ) : null}
      {props.agents.map((agent, index) => (
        <button
          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
            index === activeIndex
              ? "bg-accent text-accent-contrast"
              : "text-text-primary hover:bg-surface"
          }`}
          data-testid={`task-agent-mention-option-${agent.id}`}
          key={agent.id}
          onClick={() => props.onSelect(agent)}
          onMouseEnter={() => setActiveIndex(index)}
          type="button"
        >
          <span>@{agent.name}</span>
        </button>
      ))}
      <button className="sr-only" onClick={props.onClose} type="button">
        Close agent mentions
      </button>
    </div>
  );
}
