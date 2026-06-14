import { SpecialistAvatar } from "@/components/specialists/specialist-avatar";
import {
  SPECIALIST_EMOJI_OPTIONS,
  SPECIALIST_ICON_OPTIONS,
} from "@/components/specialists/specialist-avatar-options";

type SpecialistAvatarMode = "image" | "emoji" | "icon";

type SpecialistAvatarPickerProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  // When true, lay out as a single column (for narrow containers like the
  // review pane) instead of relying on viewport-based breakpoints.
  dense?: boolean;
};

export function SpecialistAvatarPicker(props: SpecialistAvatarPickerProps) {
  const selection = resolveSelection(props.value);

  return (
    <div className={props.dense ? "grid gap-4" : "grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)]"}>
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <SpecialistAvatar iconPath={props.value} name={props.name || "Specialist"} size="xl" />
        <p className="text-xs text-text-secondary">Preview</p>
      </div>

      <div className="grid gap-4">
        <div className="inline-flex w-fit rounded-xl border border-border bg-surface p-1">
          {MODE_OPTIONS.map((option) => {
            const selected = option.value === selection.mode;

            return (
              <button
                aria-pressed={selected}
                className={
                  selected
                    ? "rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent transition"
                    : "rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
                }
                key={option.value}
                onClick={() => props.onChange(defaultValueForMode(option.value))}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {selection.mode === "image" ? (
          <div className="grid gap-2 text-sm text-text-primary">
            <span>Image URL or file path</span>
            <input
              aria-label="Image URL or file path"
              className="cc-input"
              onChange={(event) => props.onChange(event.target.value)}
              placeholder="https://... or file:///..."
              value={selection.imageValue}
            />
            <span className="text-xs text-text-secondary">
              Supports `https://`, absolute paths, relative paths, and `file://` URLs.
            </span>
          </div>
        ) : null}

        {selection.mode === "emoji" ? (
          <div className="grid gap-3">
            <div className="grid gap-2 text-sm text-text-primary">
              <span>Emoji</span>
              <input
                aria-label="Emoji"
                className="cc-input"
                maxLength={8}
                onChange={(event) => props.onChange(`emoji:${event.target.value}`)}
                placeholder="🤖"
                value={selection.emojiValue}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {SPECIALIST_EMOJI_OPTIONS.map((emoji) => {
                const selected = selection.emojiValue === emoji;
                return (
                  <button
                    aria-label={`Use ${emoji} avatar`}
                    aria-pressed={selected}
                    className={
                      selected
                        ? "flex h-11 w-11 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-xl"
                        : "flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface text-xl transition hover:border-accent/40 hover:bg-accent/5"
                    }
                    key={emoji}
                    onClick={() => props.onChange(`emoji:${emoji}`)}
                    type="button"
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {selection.mode === "icon" ? (
          <div className="grid gap-3">
            <div className="grid gap-2 text-sm text-text-primary">
              <span>Icon name</span>
              <input
                aria-label="Icon name"
                className="cc-input"
                onChange={(event) => props.onChange(`icon:${event.target.value}`)}
                placeholder="bot"
                value={selection.iconValue}
              />
            </div>
            <div
              className={props.dense ? "grid gap-2" : "grid gap-2 sm:grid-cols-2 xl:grid-cols-3"}
            >
              {SPECIALIST_ICON_OPTIONS.map((option) => {
                const selected = props.value === option.value;
                return (
                  <button
                    aria-pressed={selected}
                    className={
                      selected
                        ? "rounded-xl border border-accent/30 bg-accent/10 p-3 text-left"
                        : "rounded-xl border border-border bg-surface p-3 text-left transition hover:border-accent/40 hover:bg-accent/5"
                    }
                    key={option.value}
                    onClick={() => props.onChange(option.value)}
                    type="button"
                  >
                    <div className="flex items-center gap-3">
                      <SpecialistAvatar iconPath={option.value} name={option.label} size="sm" />
                      <span className="text-sm font-medium text-text-primary">{option.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const MODE_OPTIONS = [
  { label: "Image", value: "image" },
  { label: "Emoji", value: "emoji" },
  { label: "Icon", value: "icon" },
] as const satisfies ReadonlyArray<{ label: string; value: SpecialistAvatarMode }>;

function resolveSelection(value: string): {
  mode: SpecialistAvatarMode;
  imageValue: string;
  emojiValue: string;
  iconValue: string;
} {
  const trimmed = value.trim();

  if (trimmed.startsWith("emoji:")) {
    return {
      mode: "emoji",
      imageValue: "",
      emojiValue: trimmed.slice(6),
      iconValue: "",
    };
  }

  if (trimmed.startsWith("icon:")) {
    return {
      mode: "icon",
      imageValue: "",
      emojiValue: "",
      iconValue: trimmed.slice(5),
    };
  }

  if (trimmed) {
    return {
      mode: "image",
      imageValue: trimmed,
      emojiValue: "",
      iconValue: "",
    };
  }

  return {
    mode: "image",
    imageValue: "",
    emojiValue: "",
    iconValue: "bot",
  };
}

function defaultValueForMode(mode: SpecialistAvatarMode): string {
  switch (mode) {
    case "emoji":
      return "emoji:🤖";
    case "icon":
      return "icon:bot";
    case "image":
    default:
      return "";
  }
}
