import { useEffect, useRef, useState } from "react";

type ChatComposerProps = {
  onSend: (text: string) => void;
  onAbort: () => void;
  agentStatus: "idle" | "busy" | "retry";
  disabled?: boolean;
};

export function ChatComposer({ onSend, onAbort, agentStatus, disabled }: ChatComposerProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="border border-border rounded-2xl p-3 bg-surface">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="cc-input flex-1 resize-none border-0 bg-transparent p-0 focus:ring-0 text-sm leading-6 max-h-40"
          placeholder="Type a message..."
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {agentStatus === "busy" ? (
          <button type="button" className="cc-button-danger shrink-0" onClick={onAbort}>
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="cc-button shrink-0"
            disabled={disabled || !text.trim()}
            onClick={handleSend}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
