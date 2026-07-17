import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/context/use-theme";

export function ThemeMenu() {
  const { colorModePreference, colorModePreferences, setColorModePreference } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Choose color mode, current: ${colorModeLabel(colorModePreference)}`}
          className="inline-flex h-9 w-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary sm:w-auto sm:px-3"
          type="button"
        >
          <ColorModeIcon mode={colorModePreference} />
          <span className="hidden sm:inline">{colorModeLabel(colorModePreference)}</span>
          <ChevronDown aria-hidden="true" className="hidden h-3.5 w-3.5 sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Choose color mode">
        <DropdownMenuRadioGroup
          onValueChange={(value) => setColorModePreference(value as ColorMode)}
          value={colorModePreference}
        >
          {colorModePreferences.map((option) => (
            <DropdownMenuRadioItem className="capitalize" key={option} value={option}>
              <ColorModeIcon mode={option} />
              {colorModeLabel(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ColorMode = "light" | "dark" | "system";

function ColorModeIcon(props: { mode: ColorMode }) {
  if (props.mode === "light") {
    return <Sun aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  if (props.mode === "dark") {
    return <Moon aria-hidden="true" className="h-3.5 w-3.5" />;
  }

  return <Monitor aria-hidden="true" className="h-3.5 w-3.5" />;
}

function colorModeLabel(mode: ColorMode): string {
  const labels = {
    dark: "Dark",
    light: "Light",
    system: "System",
  } as const;

  return labels[mode];
}
