import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-36 rounded-md border border-border bg-surface p-1 text-text-secondary shadow-xl",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

const itemClasses =
  "flex w-full cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-left text-xs text-text-secondary outline-none transition hover:bg-border/40 hover:text-text-primary focus:bg-border/40 focus:text-text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn(itemClasses, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(itemClasses, className)} {...props}>
      <span className="flex items-center gap-2">{children}</span>
      <DropdownMenuPrimitive.ItemIndicator>
        <Check aria-hidden="true" className="h-3.5 w-3.5" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
  );
}
