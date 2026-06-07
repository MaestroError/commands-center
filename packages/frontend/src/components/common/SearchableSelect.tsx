import { useEffect, useId, useRef, useState } from "react";

export type SearchableSelectOption = { id: string; label: string };

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

/**
 * A searchable single-select combobox. Shows the selected option's label when closed;
 * on focus it opens and lists every option, and typing filters by keyword (matching
 * label or id). Selection is restricted to the provided options.
 */
export function SearchableSelect(props: SearchableSelectProps) {
  const { value, onChange, options, disabled } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedLabel = options.find((option) => option.id === value)?.label ?? value;
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) =>
        `${option.label} ${option.id}`.toLowerCase().includes(normalizedQuery),
      )
    : options;

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function commit(option: SearchableSelectOption): void {
    onChange(option.id);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((current) =>
        filtered.length === 0 ? 0 : Math.min(filtered.length - 1, current + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      const option = filtered[highlight];
      if (open && option) {
        event.preventDefault();
        commit(option);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div
      className="relative"
      ref={containerRef}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        aria-label={props.ariaLabel}
        className={props.className ?? "cc-input"}
        disabled={disabled}
        placeholder={props.placeholder}
        role="combobox"
        value={open ? query : selectedLabel}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled ? (
        <ul
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-surface shadow-lg"
          id={listId}
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-secondary">No matches</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.id}>
                <button
                  aria-selected={option.id === value}
                  className={
                    index === highlight
                      ? "block w-full px-3 py-2 text-left text-sm bg-accent/10 text-accent"
                      : "block w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-elevated"
                  }
                  onClick={() => commit(option)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  role="option"
                  type="button"
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
