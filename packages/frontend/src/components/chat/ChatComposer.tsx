import { useCallback, useEffect, useRef, useState } from "react";
import type { SendConversationAttachmentInput } from "@cc/shared/schemas";
import { usePromptHistory } from "../../hooks/use-prompt-history";

import { AutoApproveToggle } from "./AutoApproveToggle";
import { AttachmentBar } from "./AttachmentBar";
import { resolveAttachmentMimeType } from "./attachment-utils";
import { FileMentionPopover } from "./FileMentionPopover";
import { SlashCommandPopover, type SlashCommand } from "./SlashCommandPopover";

type ComposerMode = "normal" | "shell";

interface ComposerSendInput {
  text: string;
  attachments: SendConversationAttachmentInput[];
  model?: string;
}

type ChatComposerProps = {
  onSend: (input: ComposerSendInput) => void;
  onShell: (command: string) => void;
  onCommand: (command: string, args?: string) => void;
  onSummarize: () => void;
  onAbort: () => void;
  onStartFresh: () => void;
  agentStatus: "idle" | "busy" | "retry";
  agentId: string;
  autoApprove: boolean;
  onAutoApproveChange: (enabled: boolean) => void;
  skills?: { slug: string; description?: string }[];
  disabled?: boolean;
  autoFocusKey?: string;
};

export function ChatComposer({
  onSend,
  onShell,
  onCommand,
  onSummarize,
  onAbort,
  onStartFresh,
  agentStatus,
  agentId,
  autoApprove,
  onAutoApproveChange,
  skills,
  disabled,
  autoFocusKey,
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ComposerMode>("normal");
  const [attachments, setAttachments] = useState<SendConversationAttachmentInput[]>([]);
  const [mentionedFiles, setMentionedFiles] = useState<{ path: string; filename: string }[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<{ slug: string; description?: string } | null>(
    null,
  );
  const [activePopover, setActivePopover] = useState<"file" | "slash" | null>(null);
  const [popoverQuery, setPopoverQuery] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverKeyHandlerRef = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);

  const history = usePromptHistory(mode);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || disabled) {
      return;
    }

    setTimeout(() => {
      const current = textareaRef.current;
      if (!current) {
        return;
      }

      current.focus();
      const position = current.value.length;
      current.setSelectionRange(position, position);
    }, 0);
  }, [autoFocusKey, disabled]);

  // Detect popover triggers
  useEffect(() => {
    if (mode === "shell") {
      setActivePopover(null);
      return;
    }

    const cursorPosition = textareaRef.current?.selectionStart ?? text.length;

    // Check for slash command at start
    const slashMatch = text.match(/^\/(\S*)$/);
    if (slashMatch) {
      setActivePopover("slash");
      setPopoverQuery(slashMatch[1] ?? "");
      return;
    }

    // Check for file mention
    const beforeCursor = text.substring(0, cursorPosition);
    const hashMatch = beforeCursor.match(/#(\S*)$/);
    if (hashMatch) {
      setActivePopover("file");
      setPopoverQuery(hashMatch[1] ?? "");
      return;
    }

    setActivePopover(null);
  }, [text, mode]);

  const getCursorPosition = useCallback(() => {
    return textareaRef.current?.selectionStart ?? 0;
  }, []);

  const setCursorPosition = useCallback((position: number | "start" | "end") => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = position === "start" ? 0 : position === "end" ? el.value.length : position;
    el.setSelectionRange(pos, pos);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && mentionedFiles.length === 0 && !selectedSkill) return;

    if (mode === "shell") {
      onShell(trimmed);
      history.addEntry(trimmed);
    } else if (selectedSkill) {
      const hasContent = trimmed || attachments.length > 0 || mentionedFiles.length > 0;
      if (hasContent) {
        // Has extra context: send as normal message with /skill prefix so the LLM
        // sees attachments + file mentions and can invoke the skill naturally
        const filePrefixes = mentionedFiles.map((f) => `#${f.path}`).join(" ");
        const parts = [`Use skill "${selectedSkill.slug}".`, filePrefixes, trimmed].filter(Boolean);
        onSend({
          text: parts.join(" "),
          attachments,
        });
      } else {
        // No extra context: execute skill directly via command API
        onCommand(selectedSkill.slug);
      }
      if (trimmed) history.addEntry(trimmed);
    } else if (trimmed.startsWith("/")) {
      const [cmd = "", ...args] = trimmed.slice(1).split(" ");
      onCommand(cmd, args.join(" "));
    } else {
      // Prepend file mentions as #path references
      const filePrefixes = mentionedFiles.map((f) => `#${f.path}`).join(" ");
      const fullText = filePrefixes ? `${filePrefixes} ${trimmed}` : trimmed;
      onSend({
        text: fullText,
        attachments,
      });
      history.addEntry(trimmed);
    }

    setText("");
    setAttachments([]);
    setMentionedFiles([]);
    setSelectedSkill(null);
    history.reset();
  }, [text, mode, attachments, mentionedFiles, selectedSkill, onSend, onShell, onCommand, history]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const cursorPosition = getCursorPosition();

      // Shell mode entry: ! at position 0 when empty
      if (e.key === "!" && cursorPosition === 0 && text === "" && mode === "normal") {
        e.preventDefault();
        setMode("shell");
        return;
      }

      // Escape: close popover, exit shell mode, or abort
      if (e.key === "Escape") {
        if (activePopover) {
          e.preventDefault();
          setActivePopover(null);
          return;
        }
        if (mode === "shell") {
          e.preventDefault();
          setMode("normal");
          return;
        }
        if (agentStatus === "busy") {
          e.preventDefault();
          onAbort();
          return;
        }
        return;
      }

      // Forward navigation keys to popover when active
      if (activePopover && popoverKeyHandlerRef.current) {
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter" || e.key === "Tab") {
          const handled = popoverKeyHandlerRef.current(e);
          if (handled) return;
        }
      }

      // Backspace at empty shell mode: exit shell mode
      if (e.key === "Backspace" && mode === "shell" && text === "" && cursorPosition === 0) {
        e.preventDefault();
        setMode("normal");
        return;
      }

      // History navigation (only when no popover is open)
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (activePopover) return;

        const direction = e.key === "ArrowUp" ? "up" : "down";
        const result = history.navigate(direction, text, cursorPosition);
        if (result.handled && result.entry !== null) {
          e.preventDefault();
          setText(result.entry);
          // Use setTimeout to ensure React state update before cursor positioning
          setTimeout(() => setCursorPosition(result.cursor), 0);
        }
      }

      // Enter to send (Shift+Enter for newline)
      if (e.key === "Enter" && !e.shiftKey && !activePopover) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      text,
      mode,
      activePopover,
      agentStatus,
      history,
      getCursorPosition,
      setCursorPosition,
      onAbort,
      handleSend,
    ],
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;

      // Shell mode entry: text starts with "!" when mode is normal and was empty
      if (mode === "normal" && text === "" && newValue === "!") {
        setMode("shell");
        setText("");
        return;
      }

      setText(newValue);
      // Reset history navigation on regular input
      if (history.isNavigating) {
        history.reset();
      }
    },
    [history, mode, text],
  );

  const handleFileMentionSelect = useCallback(
    (path: string) => {
      const isFolder = path.endsWith("/");
      const display = isFolder ? path : (path.split("/").pop() ?? path);
      setMentionedFiles((prev) => {
        if (prev.some((f) => f.path === path)) return prev;
        return [...prev, { path, filename: display }];
      });

      // Remove the #query from the text
      const cursorPosition = getCursorPosition();
      const beforeCursor = text.substring(0, cursorPosition);
      const afterCursor = text.substring(cursorPosition);
      const hashIndex = beforeCursor.lastIndexOf("#");

      if (hashIndex !== -1) {
        const newText = beforeCursor.substring(0, hashIndex) + afterCursor;
        setText(newText);
        setTimeout(() => {
          setCursorPosition(hashIndex);
          textareaRef.current?.focus();
        }, 0);
      }

      setActivePopover(null);
    },
    [text, getCursorPosition, setCursorPosition],
  );

  const addMentionedFile = useCallback((path: string) => {
    const isFolder = path.endsWith("/");
    const display = isFolder ? path : (path.split("/").pop() ?? path);

    setMentionedFiles((prev) => {
      if (prev.some((file) => file.path === path)) {
        return prev;
      }

      return [...prev, { path, filename: display }];
    });
  }, []);

  const handleSlashCommandSelect = useCallback(
    (command: SlashCommand) => {
      setActivePopover(null);
      setText("");

      if (command.type === "skill") {
        // Skills become a pill — user can compose a message with it
        setSelectedSkill({ slug: command.name, description: command.description });
        setTimeout(() => textareaRef.current?.focus(), 0);
      } else if (command.name === "new") {
        onStartFresh();
      } else if (command.name === "compact") {
        onSummarize();
      } else {
        onCommand(command.name, "");
      }
    },
    [onCommand, onStartFresh, onSummarize],
  );

  const handlePopoverKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Bubble up non-handled keys
    if (e.key === "Escape") {
      setActivePopover(null);
    }
  }, []);

  // File attachment handling
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const mimeType = resolveAttachmentMimeType(file);
        const attachment: SendConversationAttachmentInput = {
          id: `${Date.now()}-${file.name}`,
          type: mimeType.startsWith("image/") ? "image" : "file",
          filename: file.name,
          mimeType,
          dataUrl,
          sizeBytes: file.size,
        };
        setAttachments((prev) => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const fileMentionPath = e.dataTransfer.getData("application/x-cc-file-mention");
      if (fileMentionPath.length > 0) {
        addMentionedFile(fileMentionPath);
        textareaRef.current?.focus();
        return;
      }

      handleFileSelect(e.dataTransfer.files);
    },
    [addMentionedFile, handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const files: File[] = [];

      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        const fileList = new DataTransfer();
        files.forEach((f) => fileList.items.add(f));
        handleFileSelect(fileList.files);
      }
    },
    [handleFileSelect],
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const handleRemoveMention = useCallback((path: string) => {
    setMentionedFiles((prev) => prev.filter((f) => f.path !== path));
  }, []);

  const setPopoverKeyHandler = useCallback(
    (handler: ((e: React.KeyboardEvent) => boolean) | null) => {
      popoverKeyHandlerRef.current = handler;
    },
    [],
  );

  const isBusy = agentStatus !== "idle";
  const showShortcutPills = text.length === 0 && !selectedSkill && mentionedFiles.length === 0;

  const activateShortcut = useCallback(
    (shortcut: "#" | "/" | "!") => {
      if (disabled) {
        return;
      }

      if (shortcut === "!") {
        setMode("shell");
        setText("");
        setSelectedSkill(null);
      } else {
        setMode("normal");
        setText(shortcut);
      }

      setActivePopover(shortcut === "!" ? null : shortcut === "#" ? "file" : "slash");
      setPopoverQuery("");

      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }

        textarea.focus();
        const position = shortcut === "!" ? 0 : 1;
        textarea.setSelectionRange(position, position);
      }, 0);
    },
    [disabled],
  );

  return (
    <div
      className="relative border border-border rounded-md bg-surface"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment Bar */}
      <AttachmentBar attachments={attachments} onRemove={handleRemoveAttachment} />

      {/* Top toolbar: attach + auto toggle + pills */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-7 items-center gap-1 rounded-md bg-surface-elevated px-2 text-xs text-text-secondary hover:bg-surface hover:text-text-primary"
            title="Attach files"
            disabled={disabled || mode === "shell"}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <AutoApproveToggle enabled={autoApprove} onChange={onAutoApproveChange} />

          {/* Skill & File Mention Pills */}
          {selectedSkill && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-purple-500/15 px-2 py-1 text-xs font-medium text-purple-400"
              title={selectedSkill.description}
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              /{selectedSkill.slug}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-purple-500/20"
                onClick={() => setSelectedSkill(null)}
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          )}
          {mentionedFiles.map((file) => (
            <span
              key={file.path}
              className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent"
              title={file.path}
            >
              {file.path.endsWith("/") ? (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              ) : (
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              )}
              {file.filename}
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20"
                onClick={() => handleRemoveMention(file.path)}
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        {showShortcutPills ? (
          <div className="hidden items-center gap-2 text-[11px] text-text-secondary lg:flex">
            <button
              className="rounded-full border border-border px-2 py-0.5 font-mono transition hover:border-accent hover:text-text-primary"
              disabled={disabled}
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
              disabled={disabled}
              onClick={() => activateShortcut("!")}
              type="button"
            >
              ! shell
            </button>
          </div>
        ) : null}
      </div>

      {/* Input Area */}
      <div className="relative p-3">
        {/* Mode Badge */}
        {mode === "shell" && (
          <div className="absolute left-3 top-3 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
            Shell
          </div>
        )}

        <div className="flex items-start gap-2">
          <textarea
            ref={textareaRef}
            className={`flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-6 max-h-40 text-text-primary outline-none placeholder:text-text-secondary ${
              mode === "shell" ? "font-mono pl-14" : ""
            }`}
            placeholder={
              mode === "shell"
                ? "Enter shell command..."
                : selectedSkill
                  ? `Prompt for /${selectedSkill.slug}...`
                  : 'Type a message... Use "#" to mention'
            }
            rows={1}
            value={text}
            disabled={disabled}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />

          {isBusy ? (
            <button type="button" className="cc-button cc-button-danger shrink-0" onClick={onAbort}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="cc-button shrink-0"
              disabled={disabled || (!text.trim() && mentionedFiles.length === 0 && !selectedSkill)}
              onClick={handleSend}
            >
              Send
            </button>
          )}
        </div>
        {/* Popovers */}
        {activePopover === "file" && (
          <FileMentionPopover
            agentId={agentId}
            query={popoverQuery}
            onSelect={handleFileMentionSelect}
            onClose={() => setActivePopover(null)}
            onKeyDown={handlePopoverKeyDown}
            registerKeyHandler={setPopoverKeyHandler}
          />
        )}

        {activePopover === "slash" && (
          <SlashCommandPopover
            query={popoverQuery}
            skills={skills}
            onSelect={handleSlashCommandSelect}
            onClose={() => setActivePopover(null)}
            onKeyDown={handlePopoverKeyDown}
            registerKeyHandler={setPopoverKeyHandler}
          />
        )}
      </div>
    </div>
  );
}
