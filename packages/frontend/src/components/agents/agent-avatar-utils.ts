import {
  Bot,
  Brain,
  Briefcase,
  Bug,
  Calculator,
  Code2,
  FileText,
  FlaskConical,
  FolderKanban,
  Globe,
  Hammer,
  Headphones,
  Image,
  Lightbulb,
  MessageSquare,
  Microscope,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Terminal,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const LUCIDE_ICON_MAP = {
  bot: Bot,
  brain: Brain,
  briefcase: Briefcase,
  bug: Bug,
  calculator: Calculator,
  code2: Code2,
  filetext: FileText,
  flaskconical: FlaskConical,
  folderkanban: FolderKanban,
  globe: Globe,
  hammer: Hammer,
  headphones: Headphones,
  image: Image,
  lightbulb: Lightbulb,
  messagesquare: MessageSquare,
  microscope: Microscope,
  rocket: Rocket,
  search: Search,
  shield: Shield,
  sparkles: Sparkles,
  terminal: Terminal,
  userround: UserRound,
  wrench: Wrench,
} satisfies Record<string, LucideIcon>;

export type ParsedAgentAvatar =
  | { type: "image"; src: string }
  | { type: "emoji"; value: string }
  | { type: "icon"; value: string }
  | { type: "initials"; value: string };

export function parseAgentAvatar(name: string, iconPath?: string): ParsedAgentAvatar {
  const value = iconPath?.trim();

  if (!value) {
    return { type: "initials", value: readInitials(name) };
  }

  if (value.startsWith("icon:")) {
    const iconName = normalizeIconName(value.slice(5));
    return resolveIconComponent(iconName)
      ? { type: "icon", value: iconName }
      : { type: "initials", value: readInitials(name) };
  }

  if (value.startsWith("emoji:")) {
    const emoji = value.slice(6).trim();
    return emoji
      ? { type: "emoji", value: emoji }
      : { type: "initials", value: readInitials(name) };
  }

  if (looksLikeImageSource(value)) {
    return { type: "image", src: value };
  }

  if (looksLikeEmoji(value)) {
    return { type: "emoji", value };
  }

  return { type: "initials", value: readInitials(name) };
}

export function readInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() || "A";
  }

  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "A"
  );
}

export function resolveIconComponent(iconName: string): LucideIcon | undefined {
  const normalizedIconName = normalizeIconName(iconName);
  return LUCIDE_ICON_MAP[normalizedIconName as keyof typeof LUCIDE_ICON_MAP];
}

function normalizeIconName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeImageSource(value: string): boolean {
  return (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("file://") ||
    value.startsWith("data:image/")
  );
}

function looksLikeEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value);
}
