import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { useTheme } from "@/context/use-theme";

export function ThemeMenu() {
  const { theme, themes, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative hidden sm:block" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        Theme: {theme}
        <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div
          aria-label="Choose theme"
          className="absolute right-0 z-40 mt-2 min-w-36 rounded-md border border-border bg-surface p-1 shadow-xl"
          role="menu"
        >
          {themes.map((option) => (
            <button
              aria-checked={option === theme}
              className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-xs capitalize text-text-secondary transition hover:bg-border/40 hover:text-text-primary"
              key={option}
              onClick={() => {
                setTheme(option);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              {option}
              {option === theme ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
