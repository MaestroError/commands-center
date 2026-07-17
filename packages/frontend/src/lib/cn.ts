import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Compose conditional class names and resolve conflicting Tailwind utilities so
 * a later utility wins predictably. Shared by CC's `components/ui` primitives.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
