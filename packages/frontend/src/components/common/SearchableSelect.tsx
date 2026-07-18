import { useEffect, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

export type SearchableSelectOption = { id: string; label: string };

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  emptyOptionLabel?: string;
  required?: boolean;
  testId?: string;
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
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = options.find((option) => option.id === value)?.label ?? value;

  useEffect(() => {
    inputRef.current?.setCustomValidity(props.required && !value ? "Please select an option." : "");
  }, [props.required, value]);

  function commit(option: SearchableSelectOption): void {
    onChange(option.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <Command
      className="relative"
      label={props.ariaLabel ?? props.placeholder ?? "Options"}
      shouldFilter
    >
      <Popover
        open={open && !disabled}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setQuery("");
          }
        }}
      >
        <PopoverAnchor asChild>
          <CommandInput
            ref={inputRef}
            aria-expanded={open && !disabled}
            aria-label={props.ariaLabel}
            aria-required={props.required || undefined}
            className={props.className}
            data-testid={props.testId}
            disabled={disabled}
            placeholder={props.placeholder}
            required={props.required}
            value={open ? query : selectedLabel}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && !open) {
                setOpen(true);
              }
              if (event.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
            onValueChange={(nextQuery) => {
              setQuery(nextQuery);
              setOpen(true);
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target === inputRef.current) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            {props.emptyOptionLabel ? (
              <CommandItem
                keywords={[props.emptyOptionLabel]}
                value="__cc-empty-option"
                onPointerDown={(event) => event.preventDefault()}
                onSelect={() => commit({ id: "", label: props.emptyOptionLabel ?? "" })}
              >
                {props.emptyOptionLabel}
              </CommandItem>
            ) : null}
            {options.map((option) => (
              <CommandItem
                key={option.id}
                keywords={[option.label]}
                value={option.id}
                onPointerDown={(event) => event.preventDefault()}
                onSelect={() => commit(option)}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  );
}
