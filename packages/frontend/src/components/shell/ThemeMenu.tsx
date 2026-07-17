import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/context/use-theme";

export function ThemeMenu() {
  const { colorModePreference, colorModePreferences, setColorModePreference } = useTheme();
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
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Choose color mode, current: ${colorModeLabel(colorModePreference)}`}
        className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary sm:w-auto sm:px-3"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <ColorModeIcon mode={colorModePreference} />
        <span className="hidden sm:inline">{colorModeLabel(colorModePreference)}</span>
        <ChevronDown aria-hidden="true" className="hidden h-3.5 w-3.5 sm:block" />
      </button>
      {open ? (
        <div
          aria-label="Choose color mode"
          className="absolute right-0 z-40 mt-2 min-w-36 rounded-md border border-border bg-surface p-1 shadow-xl"
          role="menu"
        >
          {colorModePreferences.map((option) => (
            <button
              aria-checked={option === colorModePreference}
              className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-xs capitalize text-text-secondary transition hover:bg-border/40 hover:text-text-primary"
              key={option}
              onClick={() => {
                setColorModePreference(option);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="flex items-center gap-2">
                <ColorModeIcon mode={option} />
                {colorModeLabel(option)}
              </span>
              {option === colorModePreference ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColorModeIcon(props: { mode: "light" | "dark" | "system" }) {
  if (props.mode === "light") {
    return <Sun aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  if (props.mode === "dark") {
    return <Moon aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  return <Monitor aria-hidden="true" className="h-3.5 w-3.5" />;
}

function colorModeLabel(mode: "light" | "dark" | "system"): string {
  const labels = {
    dark: "Dark",
    light: "Light",
    system: "System",
  } as const;

  return labels[mode];
}
