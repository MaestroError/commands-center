import { Bot } from "lucide-react";

import {
  parseSpecialistAvatar,
  resolveIconComponent,
} from "@/components/specialists/specialist-avatar-utils";

type SpecialistAvatarProps = {
  name: string;
  iconPath?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_CLASS_NAMES = {
  xs: "h-5 w-5 rounded-md text-[10px]",
  sm: "h-8 w-8 rounded-md text-sm",
  md: "h-10 w-10 rounded-lg text-base",
  lg: "h-14 w-14 rounded-lg text-lg",
  xl: "h-16 w-16 rounded-xl text-xl",
} as const;

export function SpecialistAvatar({
  name,
  iconPath,
  size = "md",
  className,
}: SpecialistAvatarProps) {
  const parsed = parseSpecialistAvatar(name, iconPath);
  const sizeClassName = SIZE_CLASS_NAMES[size];
  const rootClassName = [
    "flex shrink-0 items-center justify-center overflow-hidden border border-border bg-surface-elevated text-accent",
    sizeClassName,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (parsed.type === "image") {
    return <img alt="" className={`${rootClassName} object-cover`} src={parsed.src} />;
  }

  if (parsed.type === "emoji") {
    return <div className={rootClassName}>{parsed.value}</div>;
  }

  if (parsed.type === "icon") {
    const IconComponent = resolveIconComponent(parsed.value) ?? Bot;
    return <div className={rootClassName}>{<IconComponent className="h-[60%] w-[60%]" />}</div>;
  }

  return <div className={`${rootClassName} font-semibold`}>{parsed.value}</div>;
}
