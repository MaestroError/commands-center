import { useEffect, useMemo, useRef, useState } from "react";

import { useProvidersQuery } from "../../hooks/use-providers-query";

interface ModelSelectorProps {
  value: string | null;
  onChange: (modelId: string) => void;
  defaultModel?: string;
}

interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  connected: boolean;
}

const RECENT_MODELS_KEY = "cc-recent-models";
const MAX_RECENT_MODELS = 5;

function readRecentModels(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function persistRecentModel(modelKey: string): string[] {
  const next = [modelKey, ...readRecentModels().filter((id) => id !== modelKey)].slice(
    0,
    MAX_RECENT_MODELS,
  );
  try {
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
  return next;
}

const pillClass =
  "inline-flex h-7 max-w-[14rem] items-center gap-1 rounded-full border border-border bg-surface-elevated px-2.5 text-xs text-text-primary transition hover:border-accent focus:border-accent focus:outline-none disabled:cursor-default disabled:opacity-50";

export function ModelSelector({ value, onChange, defaultModel }: ModelSelectorProps) {
  const { data: providers, isLoading } = useProvidersQuery();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentModels, setRecentModels] = useState<string[]>(() => readRecentModels());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const connectedModels = useMemo<ModelOption[]>(
    () =>
      (providers ?? [])
        .flatMap((provider) =>
          provider.models.map((model) => ({
            id: model.id,
            name: model.name,
            providerId: provider.provider.id,
            providerName: provider.provider.name,
            connected: provider.connected,
          })),
        )
        .filter((model) => model.connected),
    [providers],
  );

  const uniqueKey = (model: ModelOption) => `${model.providerId}/${model.id}`;
  const selectedKey =
    value ?? defaultModel ?? (connectedModels[0] ? uniqueKey(connectedModels[0]) : "");
  const selectedModel = connectedModels.find((model) => uniqueKey(model) === selectedKey);

  const modelByKey = useMemo(() => {
    const map = new Map<string, ModelOption>();
    for (const model of connectedModels) {
      map.set(uniqueKey(model), model);
    }
    return map;
  }, [connectedModels]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (model: ModelOption) =>
    !normalizedQuery ||
    `${model.providerName} ${model.name}`.toLowerCase().includes(normalizedQuery) ||
    uniqueKey(model).toLowerCase().includes(normalizedQuery);

  // Suggested = recently chosen models that are still available, matching the filter.
  const recentMatches = useMemo(() => {
    const seen = new Set<string>();
    const result: ModelOption[] = [];
    for (const key of recentModels) {
      const model = modelByKey.get(key);
      if (model && !seen.has(key) && matchesQuery(model)) {
        seen.add(key);
        result.push(model);
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentModels, modelByKey, normalizedQuery]);

  const recentKeySet = new Set(recentMatches.map(uniqueKey));
  const otherMatches = connectedModels.filter(
    (model) => !recentKeySet.has(uniqueKey(model)) && matchesQuery(model),
  );
  const flatList = [...recentMatches, ...otherMatches];

  // Reset highlight to the top whenever the visible list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, open]);

  // Focus the filter input when the popover opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setRecentModels(readRecentModels());
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (open && listRef.current) {
      const activeElement = listRef.current.querySelectorAll("[data-model-option]")[activeIndex] as
        | HTMLElement
        | undefined;
      activeElement?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeIndex, open, flatList.length]);

  if (isLoading) {
    return (
      <span className={`${pillClass} opacity-50`} aria-disabled>
        Loading…
      </span>
    );
  }

  if (connectedModels.length === 0) {
    return (
      <span className={`${pillClass} opacity-50`} aria-disabled>
        No models available
      </span>
    );
  }

  const selectModel = (model: ModelOption) => {
    const key = uniqueKey(model);
    onChange(key);
    setRecentModels(persistRecentModel(key));
    setOpen(false);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(flatList.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const model = flatList[activeIndex];
      if (model) {
        selectModel(model);
      }
    }
  };

  const renderOption = (model: ModelOption, index: number) => {
    const key = uniqueKey(model);
    const isSelected = key === selectedKey;
    return (
      <button
        key={key}
        data-model-option
        type="button"
        className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${
          index === activeIndex
            ? "bg-surface-elevated text-text-primary"
            : "text-text-secondary hover:bg-surface-elevated"
        }`}
        onClick={() => selectModel(model)}
        onMouseEnter={() => setActiveIndex(index)}
      >
        <span className="min-w-0 truncate">
          <span className="text-text-secondary">{model.providerName} / </span>
          <span className="text-text-primary">{model.name}</span>
        </span>
        {isSelected ? <CheckIcon /> : null}
      </button>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Select model"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={pillClass}
        onClick={() => setOpen((current) => !current)}
        title={
          selectedModel ? `${selectedModel.providerName} / ${selectedModel.name}` : "Select model"
        }
      >
        <ChipIcon />
        <span className="min-w-0 truncate">
          {selectedModel ? selectedModel.name : "Select model"}
        </span>
        <ChevronIcon />
      </button>

      {open ? (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-[100] w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          role="listbox"
        >
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              aria-label="Filter models"
              placeholder="Filter models…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              className="h-7 w-full rounded-md border border-border bg-surface-elevated px-2 text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {flatList.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-secondary">
                No matching models
              </div>
            ) : (
              <>
                {recentMatches.length > 0 ? (
                  <>
                    <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                      Suggested
                    </div>
                    {recentMatches.map((model, index) => renderOption(model, index))}
                    {otherMatches.length > 0 ? (
                      <div className="my-1 border-t border-border" />
                    ) : null}
                  </>
                ) : null}
                {otherMatches.map((model, index) =>
                  renderOption(model, recentMatches.length + index),
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChipIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4 10v4M20 10v4M10 4h4M10 20h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3 w-3 shrink-0 text-text-secondary" fill="none" viewBox="0 0 24 24">
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-accent" fill="none" viewBox="0 0 24 24">
      <path
        d="m5 12 5 5 9-11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
